/* Network view — d3 force graph of the fraud ring vs the isolated star */
(function () {
  window.Views = window.Views || {};

  function buildSubgraph() {
    var D = window.DP.raw, P = {}; D.providers.forEach(function (p) { P[p.id] = p; });
    var V = {}; D.veterans.forEach(function (v) { V[v.id] = v; });
    var provIds = ["PR001", "PR002", "PR003"];
    var nodes = [], links = [], seen = {};
    provIds.forEach(function (id) { var p = P[id]; nodes.push({ id: id, type: "Provider", name: shortName(p.name), full: p.name, risk: p.riskScore, npi: p.npi, tin: p.tin, spec: p.taxonomyLabel }); seen[id] = 1; });
    var shared = D.graph.edges.filter(function (e) { return e.type === "SHARES_PATIENT_WITH" && e.props && e.props.veteranId; }).map(function (e) { return e.props.veteranId; });
    [].concat(shared).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).forEach(function (vid) {
      var v = V[vid]; nodes.push({ id: vid, type: "Veteran", name: v.name, city: v.city }); seen[vid] = 1;
      links.push({ source: "PR001", target: vid, type: "treated" });
      links.push({ source: "PR002", target: vid, type: "treated" });
    });
    var walter = D.veterans.find(function (v) { return v.name === "Walter Briggs"; });
    nodes.push({ id: walter.id, type: "Veteran", name: walter.name, city: walter.city });
    links.push({ source: "PR003", target: walter.id, type: "treated ×36" });
    links.push({ source: "PR001", target: "PR002", type: "SHARES TIN" });
    links.push({ source: "PR001", target: "PR002", type: "referred ×9" });
    D.allegations.filter(function (a) { return provIds.indexOf(a.providerId) >= 0; }).forEach(function (a) {
      var nid = "AL" + a.id;
      nodes.push({ id: nid, type: "Allegation", name: shortFwa(a.fwaType), risk: a.riskScore, allegId: a.id });
      links.push({ source: a.providerId, target: nid, type: "flag" });
    });
    return { nodes: nodes, links: links };
  }

  window.Views.network = {
    render: function (mount) {
      var scnBtn = function (id, label, sub) { return '<button class="nscn" data-scn="' + id + '" style="border:none;background:none;border-radius:6px;padding:5px 11px;font-size:12px;cursor:pointer;color:var(--text2);font-family:var(--sans);display:flex;flex-direction:column;align-items:flex-start;line-height:1.2"><span style="font-weight:500">' + label + '</span><span style="font-size:9.5px;color:var(--text3)">' + sub + '</span></button>'; };
      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Provider network</div><div class="page-sub">Two known collusion patterns — pick a scenario. Click any provider to open its report card.</div></div>' +
        '<div style="display:flex;gap:10px;align-items:center">' +
        '<div style="display:flex;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;padding:2px">' + scnBtn("ring", "Shared-TIN ring", "one billing entity") + scnBtn("chain", "Residential chain", "AZ → CA → NV") + '</div>' +
        '<span id="n-ring-tools" style="display:flex;gap:7px"><button class="btn" id="n-ring"><i class="ti ti-focus-2"></i> Highlight ring</button><button class="btn" id="n-reset">Reset</button></span>' +
        window.EXPORT.group("nw") +
        '</div></div>' +
        '<div class="canvas" id="n-canvas"></div>' +
        '<div class="legend" id="n-legend"></div>' +
        '<div id="n-boxes" style="display:flex;gap:10px;margin-top:4px"></div>' +
        '</div>';

      var current = "ring";
      function setActive(scn) { mount.querySelectorAll(".nscn").forEach(function (b) { var on = b.getAttribute("data-scn") === scn; b.style.background = on ? "var(--card)" : "none"; b.style.color = on ? "var(--ink)" : "var(--text2)"; b.style.boxShadow = on ? "0 1px 2px rgba(16,36,59,.08)" : "none"; }); }
      function paint(scn) {
        current = scn; setActive(scn);
        var legend = document.getElementById("n-legend"), boxes = document.getElementById("n-boxes"), tools = document.getElementById("n-ring-tools");
        if (scn === "chain") {
          tools.style.display = "none";
          legend.innerHTML = legendChain();
          boxes.innerHTML = boxesChain();
          window.Collusion.render(document.getElementById("n-canvas"), "PR300", { height: 440 });
        } else {
          tools.style.display = "flex";
          legend.innerHTML = legendRing();
          boxes.innerHTML = boxesRing();
          draw(buildSubgraph());
        }
      }
      mount.querySelectorAll(".nscn").forEach(function (b) { b.onclick = function () { paint(b.getAttribute("data-scn")); }; });
      window.EXPORT.wire("nw", {
        csv: function () { var d = netData(current); window.EXPORT.csv("collusion-network-" + current, d.eHead, d.eRows); },
        xls: function () { var d = netData(current); window.EXPORT.xls("collusion-network-" + current, "Edges", d.eHead, d.eRows); },
        pdf: function () {
          var d = netData(current), s = window.Collusion.analyze(d.focus);
          var summary = s.kind === "chain"
            ? window.APP.esc(s.registration || "") + " — " + s.providerCount + " facilities across " + s.states.join("/") + ", shared officer " + window.APP.esc(s.officer || "") + ", " + s.sharedPct + "% shared veterans, separate TINs (hidden common ownership)."
            : s.providerCount + " providers operating as one billing entity — shared TIN " + (s.tin || "") + ", " + s.referralCount + " referrals, " + s.sharedPct + "% shared veterans.";
          window.EXPORT.pdf("Collusion network — " + (current === "chain" ? "residential chain" : "shared-TIN ring"),
            "<div class='card'>" + window.EXPORT.htmlEsc(summary) + "</div><h2>Providers</h2>" + window.EXPORT.tableHtml(d.pHead, d.pRows) +
            "<h2>Shared-identifier edges</h2>" + window.EXPORT.tableHtml(["Type", "Source", "Target", "Detail"], d.eRows.map(function (e) { return [e[0], e[2], e[4], e[5]]; })));
        }
      });
      paint("ring");
    }
  };

  // export data for the current scenario's collusion subgraph
  function netData(scn) {
    var focus = scn === "chain" ? "PR300" : "PR001";
    var net = window.DP.getCollusionNetwork(focus), provs = net.providers.filter(Boolean);
    var nameOf = {}; provs.forEach(function (p) { nameOf[p.id] = p.name; });
    var pHead = ["ID", "Name", "NPI", "TIN", "State", "Risk", "Role"];
    var pRows = provs.map(function (p) { return [p.id, p.name, p.npi, p.tin, p.state, p.riskScore, p.role]; });
    var eHead = ["Type", "Source", "Source name", "Target", "Target name", "Detail"];
    var eRows = net.links.map(function (e) { var pr = e.props || {}; var det = pr.tin || pr.officer || pr.registration || (pr.sharedVeterans ? pr.sharedVeterans + " shared veterans" : "") || (pr.veteranId ? "veteran " + pr.veteranId : "") || ""; return [e.type, e.source, nameOf[e.source] || e.source, e.target, nameOf[e.target] || e.target, det]; });
    return { focus: focus, pHead: pHead, pRows: pRows, eHead: eHead, eRows: eRows };
  }

  function legendRing() {
    return lg("#c6362f", "#fbe3e3", "Provider · high risk") + lg("#c77d11", "#fbe6cf", "Provider · medium") +
      lg("#378add", "#e6f1fb", "Veteran") + lg("#8b1a13", "#fbe3e3", "Lead") +
      lgLine("#c6362f", 3, null, "Shared TIN") + lgLine("#0f6e56", 1.6, "5,4", "Referral") + lgLine("#c2cad4", 1, null, "Shared patient");
  }
  function legendChain() {
    return lg("#10243b", "#dfe4ea", "Business entity") + lg("#0f6e56", "#e6f7f4", "Facility in this case") + lg("#c6362f", "#fbe3e3", "Chain facility · high risk") +
      lg("#378add", "#e6f1fb", "Cross-billed veteran") +
      lgLine("#b5730e", 2, null, "Same registration") + lgLine("#7a3aa0", 2, null, "Same officer") + lgLine("#8a95a3", 1, null, "Shared patients");
  }
  function boxesRing() {
    return '<div style="flex:1;background:var(--high-bg);border:0.5px solid #f3c9c9;border-radius:8px;padding:10px 12px"><div style="display:flex;align-items:center;gap:6px;font-weight:500;font-size:12.5px;color:var(--high-tx)"><i class="ti ti-alert-triangle"></i>Ring detected</div><div style="font-size:11.5px;color:#7a3a34;margin-top:3px;line-height:1.5">Alamo Internal Medicine &amp; Rio Grande Surgical share <span class="mono">TIN 00-6820473</span>, 9 referrals and 6 patients — two providers, one billing entity, coordinated anomalies.</div></div>' +
      '<div style="flex:1;background:var(--low-bg);border:0.5px solid #bfe0c9;border-radius:8px;padding:10px 12px"><div style="display:flex;align-items:center;gap:6px;font-weight:500;font-size:12.5px;color:var(--low-tx)"><i class="ti ti-circle-check"></i>Benign by contrast</div><div style="font-size:11.5px;color:#2f5a44;margin-top:3px;line-height:1.5">Coastal Kidney Care links to a <span style="font-weight:500">single patient</span> (36 dialysis claims) — an isolated star, not a ring.</div></div>';
  }
  function boxesChain() {
    var s = window.Collusion.analyze("PR300");
    return '<div style="flex:1">' + window.Collusion.narrativeHtml(s) + '</div>' +
      '<div style="flex:1;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;padding:10px 12px"><div style="display:flex;align-items:center;gap:6px;font-weight:500;font-size:12.5px;color:var(--ink)"><i class="ti ti-route"></i>How to read it</div><div style="font-size:11.5px;color:var(--text2);margin-top:3px;line-height:1.5">Each blue dot is a veteran; lines to multiple facilities show the same patient cycled across states. The facilities share an officer and a business registration but bill under <span style="font-weight:500">separate TINs</span> — which is what keeps the common ownership hidden from single-claim review. Click a facility to open its report card and flagged claims.</div></div>';
  }

  function draw(G) {
    var el = document.getElementById("n-canvas");
    if (typeof d3 === "undefined") { setTimeout(function () { draw(G); }, 60); return; }
    var W = el.clientWidth || 900, H = 440;
    d3.select(el).selectAll("svg,div").remove();
    var svg = d3.select(el).append("svg").attr("width", "100%").attr("height", H).attr("viewBox", "0 0 " + W + " " + H).attr("preserveAspectRatio", "xMidYMid meet");
    var g = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.4, 3]).on("zoom", function (e) { g.attr("transform", e.transform); }));
    svg.append("defs").append("marker").attr("id", "n-ar").attr("viewBox", "0 -4 8 8").attr("refX", 20).attr("refY", 0).attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto").append("path").attr("d", "M0,-4L8,0L0,4").attr("fill", "#0f6e56");
    G.nodes.forEach(function (n) { n.x = n.id === "PR003" ? W * 0.8 : W * 0.42 + (Math.random() * 60 - 30); n.y = H / 2 + (Math.random() * 60 - 30); });
    var ring = { PR001: 1, PR002: 1 };
    G.nodes.forEach(function (n) { if (n.type === "Veteran" && n.name !== "Walter Briggs") ring[n.id] = 1; if (n.type === "Allegation" && ["20481", "20517", "20092", "20061"].indexOf(n.allegId) >= 0) ring[n.id] = 1; });

    var sim = d3.forceSimulation(G.nodes)
      .force("link", d3.forceLink(G.links).id(function (d) { return d.id; }).distance(function (l) { return l.type === "flag" ? 38 : 66; }).strength(0.6))
      .force("charge", d3.forceManyBody().strength(-330))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide().radius(function (d) { return rad(d) + 9; }));

    var lk = g.append("g").selectAll("line").data(G.links).join("line")
      .attr("stroke", function (d) { return d.type === "SHARES TIN" ? "#c6362f" : d.type === "referred ×9" ? "#0f6e56" : d.type === "flag" ? "#cbd2da" : d.type === "treated ×36" ? "#c77d11" : "#c2cad4"; })
      .attr("stroke-width", function (d) { return d.type === "SHARES TIN" ? 3 : d.type.indexOf("referred") >= 0 || d.type === "treated ×36" ? 1.6 : 1; })
      .attr("stroke-dasharray", function (d) { return d.type === "flag" ? "2,3" : d.type === "referred ×9" ? "5,4" : null; })
      .attr("marker-end", function (d) { return d.type === "referred ×9" ? "url(#n-ar)" : null; });
    var lt = g.append("g").selectAll("text").data(G.links.filter(function (d) { return ["SHARES TIN", "referred ×9", "treated ×36"].indexOf(d.type) >= 0; })).join("text").text(function (d) { return d.type; }).attr("font-size", 8).attr("font-family", "IBM Plex Mono,monospace").attr("fill", function (d) { return d.type === "SHARES TIN" ? "#8b1a13" : d.type === "treated ×36" ? "#7a4a06" : "#0f6e56"; }).attr("text-anchor", "middle").attr("font-weight", function (d) { return d.type === "SHARES TIN" ? "600" : "400"; });

    var nodeG = g.append("g").selectAll("g").data(G.nodes).join("g").attr("cursor", "pointer")
      .call(d3.drag().on("start", function (e, d) { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }).on("drag", function (e, d) { d.fx = e.x; d.fy = e.y; }).on("end", function (e, d) { if (!e.active) sim.alphaTarget(0); }));
    nodeG.append("circle").attr("r", function (d) { return rad(d); }).attr("fill", function (d) { return col(d) + "26"; }).attr("stroke", function (d) { return col(d); }).attr("stroke-width", function (d) { return d.type === "Provider" ? 2.5 : 1.5; });
    nodeG.append("text").text(function (d) { var n = d.name; return n.length > 17 ? n.slice(0, 16) + "…" : n; }).attr("text-anchor", "middle").attr("dy", function (d) { return rad(d) + 11; }).attr("font-size", function (d) { return d.type === "Provider" ? 10 : 8.5; }).attr("font-family", "IBM Plex Sans,sans-serif").attr("font-weight", function (d) { return d.type === "Provider" ? "500" : "400"; }).attr("fill", function (d) { return d.type === "Veteran" ? "#5f6b7a" : col(d); });
    nodeG.on("click", function (e, d) { if (d.type === "Allegation" && d.allegId) window.APP.openAllegation(d.allegId); });

    var tip = d3.select(el).append("div").style("position", "absolute").style("background", "#10243b").style("border-radius", "6px").style("padding", "8px 11px").style("font-size", "11px").style("font-family", "IBM Plex Mono,monospace").style("color", "#e6eef7").style("pointer-events", "none").style("opacity", 0).style("z-index", 10).style("max-width", "220px");
    nodeG.on("mouseover", function (e, d) {
      var h = "<div style='color:" + col(d) + ";margin-bottom:4px;font-family:IBM Plex Sans'>" + (d.type === "Allegation" ? "Lead" : d.type) + "</div><div>" + (d.full || d.name) + "</div>";
      if (d.type === "Provider") h += "<div style='color:#93a7bf'>NPI " + d.npi + "<br>TIN " + d.tin + "<br>" + d.spec + " · risk " + d.risk + "</div>";
      if (d.type === "Veteran") h += "<div style='color:#93a7bf'>" + d.city + ", TX</div>";
      if (d.type === "Allegation") h += "<div style='color:#93a7bf'>#" + d.allegId + " · risk " + d.risk + " · click to open</div>";
      tip.html(h).style("opacity", 1).style("left", (e.offsetX + 14) + "px").style("top", (e.offsetY - 8) + "px");
    }).on("mouseout", function () { tip.style("opacity", 0); });

    sim.on("tick", function () {
      lk.attr("x1", function (d) { return d.source.x; }).attr("y1", function (d) { return d.source.y; }).attr("x2", function (d) { return d.target.x; }).attr("y2", function (d) { return d.target.y; });
      lt.attr("x", function (d) { return (d.source.x + d.target.x) / 2; }).attr("y", function (d) { var off = d.type === "SHARES TIN" ? -7 : d.type === "referred ×9" ? 13 : -3; return (d.source.y + d.target.y) / 2 + off; });
      nodeG.attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; });
    });

    function setRing(on) {
      nodeG.style("opacity", function (d) { return !on || ring[d.id] ? 1 : 0.15; });
      lk.style("opacity", function (d) { var a = d.source.id || d.source, b = d.target.id || d.target; return !on || (ring[a] && ring[b]) ? 1 : 0.08; });
      lt.style("opacity", function (d) { var a = d.source.id || d.source, b = d.target.id || d.target; return !on || (ring[a] && ring[b]) ? 1 : 0.1; });
    }
    var rb = document.getElementById("n-ring"), active = false;
    rb.onclick = function () { active = !active; setRing(active); rb.className = active ? "btn on" : "btn"; };
    document.getElementById("n-reset").onclick = function () { active = false; rb.className = "btn"; setRing(false); svg.transition().call(d3.zoom().transform, d3.zoomIdentity); };
  }

  function col(n) { if (n.type === "Provider") return n.risk >= 80 ? "#c6362f" : n.risk >= 50 ? "#c77d11" : "#10243b"; if (n.type === "Veteran") return "#378add"; return n.risk >= 80 ? "#c6362f" : n.risk >= 50 ? "#c77d11" : "#1f8a5b"; }
  function rad(n) { return n.type === "Provider" ? 24 : n.type === "Veteran" ? 11 : 8; }
  function shortName(n) { return n.replace(" Associates", "").replace(" Partners", ""); }
  function shortFwa(f) { return f === "Frequency / over-utilization" ? "Frequency" : f === "Authorization mismatch" ? "Auth mismatch" : f === "Deceased patient" ? "Deceased pt" : f === "Modifier misuse" ? "Modifier" : f; }
  function lg(stroke, bg, label) { return '<span class="lg"><span class="dot" style="border-color:' + stroke + ';background:' + bg + '"></span>' + label + '</span>'; }
  function lgLine(color, w, dash, label) { return '<span class="lg"><span style="width:16px;height:0;border-top:' + w + 'px ' + (dash ? "dashed" : "solid") + ' ' + color + '"></span>' + label + '</span>'; }
})();
