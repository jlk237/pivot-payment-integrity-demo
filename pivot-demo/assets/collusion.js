/* Collusion — shared analysis + narrative + compact graph for a provider's
   collusion network. Fed by DP.getCollusionNetwork(providerId). Reused by the
   case view (claim.js). Attaches to window.Collusion. */
(function () {
  var LINK_RANK = { SHARES_TIN: 5, SHARES_REGISTRATION: 4, SHARES_OFFICER: 3, REFERRED_TO: 2, SHARES_PATIENT_WITH: 1 };
  var LINK_COLOR = {
    SHARES_TIN: "#c6362f", SHARES_REGISTRATION: "#b5730e", SHARES_OFFICER: "#7a3aa0",
    REFERRED_TO: "#0f6e56", SHARES_PATIENT_WITH: "#8a95a3"
  };

  // Fold the many provider↔provider edges into one summary per pair.
  function aggregate(net) {
    var byPair = {};
    (net.links || []).forEach(function (e) {
      var a = e.source, b = e.target, key = a < b ? a + "|" + b : b + "|" + a;
      var s = byPair[key] || (byPair[key] = { a: key.split("|")[0], b: key.split("|")[1], tin: null, officer: false, registration: null, referrals: 0, spCount: 0, spMax: 0, top: 0, topType: null });
      if (e.type === "SHARES_TIN") s.tin = (e.props && e.props.tin) || true;
      if (e.type === "SHARES_OFFICER") s.officer = (e.props && e.props.officer) || true;
      if (e.type === "SHARES_REGISTRATION") s.registration = (e.props && e.props.registration) || true;
      if (e.type === "REFERRED_TO") s.referrals += 1;
      // shared patients come two ways: one edge carrying a count (chain), or one edge
      // per shared veteran (ring) — take whichever yields the larger tally.
      if (e.type === "SHARES_PATIENT_WITH") {
        if (e.props && e.props.sharedVeterans) s.spMax = Math.max(s.spMax, e.props.sharedVeterans);
        else s.spCount += 1;
      }
      if (LINK_RANK[e.type] > s.top) { s.top = LINK_RANK[e.type]; s.topType = e.type; }
    });
    return Object.keys(byPair).map(function (k) { var s = byPair[k]; s.sharedPatients = Math.max(s.spCount, s.spMax); return s; });
  }

  // Edge label carries the quantitative facts only; shared TIN/officer/registration
  // are conveyed by edge color + legend + narrative (so the chain's 6 edges don't all
  // repeat the same "same officer/registration" string and turn into clutter).
  function pairLabel(s) {
    var parts = [];
    if (s.tin) parts.push("shared TIN");
    if (s.referrals) parts.push(s.referrals + " referral" + (s.referrals > 1 ? "s" : ""));
    if (s.sharedPatients) parts.push(s.sharedPatients + " shared patient" + (s.sharedPatients > 1 ? "s" : ""));
    return parts.join(" · ");
  }

  // Structured read of the network for narrative + recommendation.
  function analyze(providerId) {
    var net = window.DP.getCollusionNetwork(providerId);
    if (!net) return null;
    var provs = net.providers.filter(Boolean);
    var focus = provs.find(function (p) { return p.id === providerId; }) || provs[0] || null;
    var types = {}; (net.links || []).forEach(function (e) { types[e.type] = (types[e.type] || 0) + 1; });

    // veterans treated by >= 2 network providers (the "shuffled" patients)
    var byVet = {};
    (net.vetLinks || []).forEach(function (e) { (byVet[e.source] = byVet[e.source] || {})[e.target] = 1; });
    var vetCount = net.veterans.filter(Boolean).length;
    var sharedVetCount = Object.keys(byVet).filter(function (v) { return Object.keys(byVet[v]).length >= 2; }).length;
    var sharedPct = vetCount ? Math.round(sharedVetCount / vetCount * 100) : 0;

    var distinctTins = {}; provs.forEach(function (p) { if (p.tin) distinctTins[p.tin] = 1; });
    var kind = "isolated";
    if (provs.length > 1) kind = (types.SHARES_REGISTRATION || types.SHARES_OFFICER) ? "chain" : "ring";
    // the business entity behind the providers (holding company or shared-TIN entity)
    var business = null;
    if (provs.length > 1) {
      business = (focus && focus.registration)
        ? { id: focus.registrationId || focus.registration, name: focus.registration, kind: "Holding company", sub: focus.officer ? "officer " + focus.officer : "" }
        : { id: focus ? focus.tin : "tin", name: "TIN " + (focus ? focus.tin : ""), kind: "Billing entity", sub: "one billing entity" };
    }

    return {
      business: business,
      net: net, focus: focus, kind: kind, isRing: net.isRing && provs.length > 1,
      providers: provs, providerCount: provs.length,
      states: provs.map(function (p) { return p.state; }).filter(function (s, i, a) { return s && a.indexOf(s) === i; }),
      vetCount: vetCount, sharedVetCount: sharedVetCount, sharedPct: sharedPct,
      sharedTin: !!types.SHARES_TIN, tin: focus ? focus.tin : null, distinctTinCount: Object.keys(distinctTins).length,
      sharedOfficer: !!types.SHARES_OFFICER, officer: focus ? focus.officer : null,
      sharedRegistration: !!types.SHARES_REGISTRATION, registration: focus ? focus.registration : null,
      referralCount: types.REFERRED_TO || 0
    };
  }

  // Plain-language explainability block (why this is likely collusion).
  function narrativeHtml(s) {
    if (!s || !s.isRing) {
      return '<div style="display:flex;align-items:flex-start;gap:9px;background:var(--low-bg);border:0.5px solid #bfe0c9;border-radius:8px;padding:10px 12px">' +
        '<i class="ti ti-circle-check" style="color:var(--low-tx);margin-top:1px"></i>' +
        '<div style="font-size:11.5px;color:var(--low-tx);line-height:1.5"><span style="font-weight:600">No collusion network detected.</span> This provider bills in isolation — no shared TIN, ownership, referrals or cross-billed patients link it to another flagged provider. The flag stands on the claim\'s own merits.</div></div>';
    }
    // signal chips
    var chips = [];
    var chip = function (icon, txt, strong) { return '<span style="display:inline-flex;align-items:center;gap:4px;background:' + (strong ? "var(--high-bg)" : "var(--surface)") + ';border:0.5px solid ' + (strong ? "#f3c9c9" : "var(--border)") + ';color:' + (strong ? "var(--high-tx)" : "var(--text2)") + ';border-radius:999px;padding:2px 9px;font-size:11px;font-weight:500"><i class="ti ti-' + icon + '"></i>' + txt + '</span>'; };
    if (s.kind === "chain") {
      chips.push(chip("building-community", "1 holding company", true));
      if (s.sharedOfficer) chips.push(chip("user-shield", "same officer", true));
      chips.push(chip("id-badge-2", s.distinctTinCount + " separate TINs mask ownership", false));
    } else {
      if (s.sharedTin) chips.push(chip("id-badge-2", "shared TIN " + (s.tin || ""), true));
      if (s.referralCount) chips.push(chip("arrow-guide", s.referralCount + " cross-referrals", false));
    }
    chips.push(chip("users", s.sharedPct + "% of veterans shared", s.sharedPct >= 60));
    if (s.states.length > 1) chips.push(chip("map-pin", s.states.join(" → "), s.kind === "chain"));

    var lead;
    if (s.kind === "chain") {
      lead = '<span style="font-weight:600">' + window.APP.esc(s.registration || "A single holding company") + '</span> operates <b>' + s.providerCount + '</b> facilities across ' +
        (s.states.join(" · ")) + ' under one officer (' + window.APP.esc(s.officer || "—") + '), yet each bills under a <b>separate TIN</b> to hide the common ownership. ' +
        'The same <b>' + s.sharedVetCount + ' veterans (' + s.sharedPct + '%)</b> are cycled between the facilities for back-to-back short stays — a pattern no independent provider produces.';
    } else {
      lead = '<span style="font-weight:600">' + s.providerCount + ' flagged providers</span> operate as one billing entity: they ' +
        (s.sharedTin ? 'share <b>TIN ' + window.APP.esc(s.tin || "") + '</b>' : 'are commonly controlled') +
        (s.referralCount ? ', pass <b>' + s.referralCount + ' referrals</b> between them,' : ',') +
        ' and bill the <b>same ' + s.sharedVetCount + ' veterans (' + s.sharedPct + '%)</b> — coordinated anomalies, not independent activity.';
    }

    return '<div style="background:var(--high-bg);border:0.5px solid #f3c9c9;border-radius:8px;padding:11px 12px">' +
      '<div style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px;color:var(--high-tx);margin-bottom:6px"><i class="ti ti-affiliate"></i>' +
      (s.kind === "chain" ? "Residential-chain collusion" : "Provider ring") + ' · likely coordinated fraud</div>' +
      '<div style="font-size:11.5px;color:#5a2b27;line-height:1.55;margin-bottom:8px">' + lead + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px">' + chips.join("") + '</div>' +
      '<div style="font-size:11px;color:var(--high-tx);margin-top:8px;font-weight:500"><i class="ti ti-arrow-right"></i> ' +
      (s.sharedTin ? "shared TIN" : "shared ownership") + " + " + s.sharedPct + "% shared veterans + " +
      (s.kind === "chain" ? "same officer &amp; registration" : s.referralCount + " referrals") +
      ' &rarr; treat as a single coordinated scheme, not isolated claims.</div></div>';
  }

  // Compact force graph for an in-context panel. `el` is a positioned container.
  function render(el, providerId, opts) {
    opts = opts || {};
    var s = analyze(providerId);
    if (!s || !s.isRing) {
      el.innerHTML = '<div style="height:110px;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:11.5px;gap:6px"><i class="ti ti-circle-dashed"></i> No connected providers — nothing to map.</div>';
      return;
    }
    if (typeof d3 === "undefined") { setTimeout(function () { render(el, providerId, opts); }, 80); return; }
    var net = s.net;
    var W = el.clientWidth || 620, H = opts.height || 300;
    el.style.position = "relative";
    d3.select(el).selectAll("svg,div.cn-tip").remove();

    // nodes: business entity (center) + providers + shared veterans
    var nodes = [], byId = {};
    if (s.business) { var bn = { id: "__biz__", type: "Business", name: s.business.name, kind: s.business.kind, sub: s.business.sub }; nodes.push(bn); byId["__biz__"] = bn; }
    s.providers.forEach(function (p) { var n = { id: p.id, type: "Provider", name: shortName(p.name), full: p.name, risk: p.riskScore, npi: p.npi, tin: p.tin, state: p.state, spec: p.taxonomyLabel, focus: p.id === providerId }; nodes.push(n); byId[p.id] = n; });
    net.veterans.filter(Boolean).forEach(function (v) { var n = { id: v.id, type: "Veteran", name: v.name, city: v.city, state: v.state }; nodes.push(n); byId[v.id] = n; });

    // business→provider links + aggregated provider↔provider links + veteran treatment links
    var links = [];
    if (s.business) s.providers.forEach(function (p) { links.push({ source: "__biz__", target: p.id, kind: "biz" }); });
    var pairs = aggregate(net);
    pairs.forEach(function (p) { links.push({ source: p.a, target: p.b, kind: "prov", topType: p.topType, label: pairLabel(p) }); });
    (net.vetLinks || []).forEach(function (e) { if (byId[e.source] && byId[e.target]) links.push({ source: e.source, target: e.target, kind: "treated" }); });

    // width:100% + viewBox → scales to the container at any width (no clipping under overflow:hidden)
    var svg = d3.select(el).append("svg").attr("width", "100%").attr("height", H).attr("viewBox", "0 0 " + W + " " + H).attr("preserveAspectRatio", "xMidYMid meet").style("display", "block");
    var g = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.5, 2.5]).on("zoom", function (e) { g.attr("transform", e.transform); }));
    svg.append("defs").append("marker").attr("id", "cn-ar").attr("viewBox", "0 -4 8 8").attr("refX", 22).attr("refY", 0).attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto").append("path").attr("d", "M0,-4L8,0L0,4").attr("fill", "#0f6e56");

    var sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(function (d) { return d.id; }).distance(function (l) { return l.kind === "treated" ? 46 : l.kind === "biz" ? 96 : 128; }).strength(function (l) { return l.kind === "treated" ? 0.35 : l.kind === "biz" ? 0.55 : 0.5; }))
      .force("charge", d3.forceManyBody().strength(function (d) { return d.type === "Business" ? -820 : d.type === "Provider" ? -560 : -120; }))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide().radius(function (d) { return rad(d) + 8; }));

    var lk = g.append("g").selectAll("line").data(links).join("line")
      .attr("stroke", function (d) { return d.kind === "treated" ? "#cbd2da" : d.kind === "biz" ? "#10243b" : LINK_COLOR[d.topType] || "#8a95a3"; })
      .attr("stroke-width", function (d) { return d.kind === "treated" ? 1 : d.kind === "biz" ? 1.5 : d.topType === "SHARES_TIN" ? 3 : 2; })
      .attr("stroke-opacity", function (d) { return d.kind === "biz" ? 0.5 : 1; })
      .attr("stroke-dasharray", function (d) { return d.kind === "biz" ? "3,3" : d.kind === "treated" ? null : d.topType === "REFERRED_TO" ? "5,4" : null; })
      .attr("marker-end", function (d) { return d.topType === "REFERRED_TO" ? "url(#cn-ar)" : null; });
    var lt = g.append("g").selectAll("text").data(links.filter(function (d) { return d.kind === "prov"; })).join("text")
      .text(function (d) { return d.label; }).attr("font-size", 8.5).attr("font-family", "IBM Plex Mono,monospace")
      .attr("fill", function (d) { return LINK_COLOR[d.topType] || "#5f6b7a"; }).attr("text-anchor", "middle").attr("font-weight", "500");

    var nodeG = g.append("g").selectAll("g").data(nodes).join("g").attr("cursor", "pointer")
      .call(d3.drag().on("start", function (e, d) { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }).on("drag", function (e, d) { d.fx = e.x; d.fy = e.y; }).on("end", function (e, d) { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
    nodeG.append("circle").attr("r", function (d) { return rad(d); })
      .attr("fill", function (d) { return d.type === "Business" ? "#10243b" : col(d) + "26"; })
      .attr("stroke", function (d) { return d.type === "Business" ? "#10243b" : d.focus ? "#0f6e56" : col(d); })
      .attr("stroke-width", function (d) { return d.focus ? 3.5 : d.type === "Provider" ? 2 : d.type === "Business" ? 2 : 1.3; });
    nodeG.filter(function (d) { return d.focus; }).append("circle").attr("r", function (d) { return rad(d) + 4; }).attr("fill", "none").attr("stroke", "#17b3a6").attr("stroke-width", 1).attr("stroke-dasharray", "2,2");
    // building glyph inside the business node
    nodeG.filter(function (d) { return d.type === "Business"; }).append("text").text("⌂").attr("text-anchor", "middle").attr("dy", 5).attr("font-size", 16).attr("fill", "#7fe0d6");
    nodeG.append("text").text(function (d) { return d.type === "Provider" ? d.name : d.type === "Business" ? bizLabel(d.name) : ""; })
      .attr("text-anchor", "middle").attr("dy", function (d) { return rad(d) + 11; }).attr("font-size", function (d) { return d.type === "Business" ? 10 : 9.5; })
      .attr("font-family", "IBM Plex Sans,sans-serif").attr("font-weight", function (d) { return d.type === "Business" ? "600" : "500"; }).attr("fill", function (d) { return d.type === "Business" ? "#10243b" : col(d); });
    nodeG.filter(function (d) { return d.type === "Business"; }).append("text").text("BUSINESS ENTITY").attr("text-anchor", "middle").attr("dy", function (d) { return rad(d) + 22; }).attr("font-size", 7.5).attr("letter-spacing", "0.06em").attr("font-family", "IBM Plex Mono,monospace").attr("fill", "#8a95a3");
    nodeG.filter(function (d) { return d.type === "Provider"; }).append("text").text(function (d) { return d.state || ""; })
      .attr("text-anchor", "middle").attr("dy", 3.5).attr("font-size", 8.5).attr("font-family", "IBM Plex Mono,monospace").attr("font-weight", "600").attr("fill", function (d) { return col(d); });
    nodeG.on("click", function (e, d) { if (d.type === "Provider" && window.APP) window.APP.openProvider(d.id); if (d.type === "Business" && window.APP && s.business) window.APP.openBusiness(s.business.id); });

    var tip = d3.select(el).append("div").attr("class", "cn-tip").style("position", "absolute").style("background", "#10243b").style("border-radius", "6px").style("padding", "7px 10px").style("font-size", "10.5px").style("font-family", "IBM Plex Mono,monospace").style("color", "#e6eef7").style("pointer-events", "none").style("opacity", 0).style("z-index", 10).style("max-width", "210px");
    nodeG.on("mouseover", function (e, d) {
      var h = "<div style='color:" + (d.type === "Business" ? "#7fe0d6" : col(d)) + ";font-family:IBM Plex Sans;margin-bottom:3px'>" + (d.type === "Business" ? d.kind : d.type) + (d.focus ? " · this case" : "") + "</div><div>" + (d.full || d.name) + "</div>";
      if (d.type === "Provider") h += "<div style='color:#93a7bf'>" + d.state + " · NPI " + d.npi + "<br>TIN " + d.tin + " · risk " + d.risk + "<br>click to open profile</div>";
      if (d.type === "Veteran") h += "<div style='color:#93a7bf'>" + (d.city || "") + ", " + (d.state || "") + " · cross-billed</div>";
      if (d.type === "Business") h += "<div style='color:#93a7bf'>" + (d.sub || "") + "<br>click to open the business profile</div>";
      tip.html(h).style("opacity", 1).style("left", Math.min(e.offsetX + 12, W - 150) + "px").style("top", (e.offsetY - 6) + "px");
    }).on("mouseout", function () { tip.style("opacity", 0); });

    sim.on("tick", function () {
      lk.attr("x1", function (d) { return d.source.x; }).attr("y1", function (d) { return d.source.y; }).attr("x2", function (d) { return d.target.x; }).attr("y2", function (d) { return d.target.y; });
      lt.attr("x", function (d) { return (d.source.x + d.target.x) / 2; }).attr("y", function (d) { return (d.source.y + d.target.y) / 2 - 3; });
      nodeG.attr("transform", function (d) { return "translate(" + Math.max(rad(d), Math.min(W - rad(d), d.x)) + "," + Math.max(rad(d) + 6, Math.min(H - rad(d) - 6, d.y)) + ")"; });
    });
    for (var i = 0; i < 120; i++) sim.tick(); // settle before first paint so the panel isn't jumpy
    sim.alpha(0.3).restart();
  }

  function col(d) {
    if (d.type === "Business") return "#10243b";
    if (d.type === "Provider") return d.risk >= 80 ? "#c6362f" : d.risk >= 50 ? "#c77d11" : "#10243b";
    return "#378add";
  }
  function rad(d) { return d.type === "Business" ? 26 : d.type === "Provider" ? (d.focus ? 22 : 19) : 7; }
  function shortName(n) { return n.replace(" Center", "").replace(" Treatment", "").replace(" Associates", "").replace(" Partners", ""); }
  function bizLabel(n) { n = n.replace(" LLC", "").replace(" Holdings", "").replace(" Behavioral", ""); return n.length > 20 ? n.slice(0, 19) + "…" : n; }

  window.Collusion = { analyze: analyze, narrativeHtml: narrativeHtml, render: render, aggregate: aggregate };
})();
