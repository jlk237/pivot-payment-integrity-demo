/* Provider Report Card — 360 profile + FAMS composite-group radar, spoke
   drill-down, outlier comparison, repeat-offender watchlist, and
   adjudicate-from-provider (provider → its flagged claims). */
(function () {
  window.Views = window.Views || {};
  var selGroup = null; // currently drilled-into radar spoke

  window.Views.provider = {
    render: function (mount, params) {
      var id = params.id || window.APP.state.providerId;
      var p = window.DP.getProvider(id);
      if (!p) { mount.innerHTML = '<div class="page"><p>Provider not found.</p></div>'; return; }
      var allegs = window.DP.listAllegationsByProvider(id);
      var caseInfo = window.DP.getCase(id, "retrospective") || { caseLeads: [], openLeads: [], leadCount: 0, openCount: 0 };
      var hasCase = caseInfo.leadCount > 0;
      var claims = window.DP.listClaimsByProvider(id);
      var card = window.DP.getReportCard(id) || { groups: [], attributes: {} };
      var groups = card.groups;
      // default the drill-down to the highest-scoring outlier spoke
      if (!selGroup || !groups.find(function (g) { return g.group === selGroup; })) {
        var top = groups.slice().sort(function (a, b) { return (b.outlier - a.outlier) || (b.score - a.score); })[0];
        selGroup = top ? top.group : null;
      }
      var exposure = allegs.reduce(function (s, a) { return s + (a.exposurePost || 0); }, 0);
      var flaggedVisits = claims.filter(function (c) { return (c.lines || []).some(function (l) { return (l.violatesRuleIds || []).length; }); }).length;
      var ring = window.DP.listProviders().filter(function (x) { return x.tin === p.tin; }).length > 1;
      var chain = p.role === "chain";
      var bizId = p.registrationId || (ring ? p.tin : null);
      var hasBiz = bizId && window.DP.getBusiness(bizId);
      var repeatOffender = allegs.length >= 2 || chain;
      var watched = window.APP.isProviderWatched(id);
      var outlierCount = groups.filter(function (g) { return g.outlier; }).length;

      mount.innerHTML =
        '<div class="page">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap"><span class="btn" id="pv-back" style="padding:5px 9px"><i class="ti ti-arrow-left"></i> ' + window.APP.esc(window.APP.backLabel()) + '</span>' +
        '<span class="page-title">' + window.APP.esc(p.name) + '</span>' + window.UI.riskChip(p.riskScore || 0) +
        (hasCase ? '<span class="pill ' + (caseInfo.status === "Under investigation" ? "p-esc" : "p-new") + '"><i class="ti ti-folder"></i> Case · ' + caseInfo.leadCount + ' confirmed' + (caseInfo.openCount ? ' · +' + caseInfo.openCount + ' open' : '') + '</span>'
          : (allegs.length ? '<span class="pill p-asg"><i class="ti ti-flag"></i> ' + allegs.length + ' open lead' + (allegs.length === 1 ? '' : 's') + ' · no case yet</span>' : '')) +
        (repeatOffender ? '<span class="pill" style="background:var(--high-bg);color:var(--high-tx)"><i class="ti ti-alert-triangle"></i> Repeat offender</span>' : '') +
        (watched ? '<span class="pill" style="background:var(--med-bg);color:var(--med-tx)"><i class="ti ti-bookmark"></i> On watchlist</span>' : '') +
        '<span style="flex:1"></span>' + window.EXPORT.group("pv") +
        '<button class="btn' + (watched ? ' on' : '') + '" id="pv-flag">' + (watched ? '<i class="ti ti-bookmark-off"></i> Remove from watchlist' : '<i class="ti ti-bookmark"></i> Flag for future reference') + '</button></div>' +

        '<div class="split" style="display:flex;gap:12px;align-items:flex-start">' +
        // ---- left rail: identity ----
        '<div class="rail" style="width:220px;flex:none;display:flex;flex-direction:column;gap:10px">' +
        '<div class="card"><div class="l" style="font-size:10.5px;color:var(--text2);margin-bottom:6px">Provider</div>' +
        '<div style="font-size:11px;color:var(--text2);margin-bottom:7px">' + window.APP.esc(p.taxonomyLabel || "") + ' · ' + (p.taxonomyCode || "") + '</div>' +
        '<div class="mono" style="font-size:11px;line-height:1.7">NPI ' + p.npi + '<br>TIN ' + (ring ? '<span style="background:var(--high-bg);color:var(--high-tx);padding:0 3px;border-radius:3px">' + p.tin + '</span>' : p.tin) + '</div>' +
        (ring ? '<div style="font-size:11px;color:var(--high);margin-top:5px"><i class="ti ti-affiliate"></i> Shared TIN — provider ring</div>' : '') +
        (chain ? '<div style="font-size:11px;color:var(--high);margin-top:5px;line-height:1.5"><i class="ti ti-building-community"></i> ' + window.APP.esc(p.registration) + '<br><span style="color:var(--text2)">Officer ' + window.APP.esc(p.officer) + ' · ' + window.APP.esc(p.registrationId) + '</span></div>' : '') +
        '<div style="font-size:11px;color:var(--text2);margin-top:6px">' + window.APP.esc(p.city || "") + ', ' + (p.state || "") + '</div>' +
        (hasBiz ? '<div style="font-size:11.5px;color:var(--accent-d);margin-top:8px;cursor:pointer" id="pv-biz"><i class="ti ti-building-community"></i> View business entity</div>' : '') +
        '<div style="font-size:11.5px;color:var(--accent-d);margin-top:8px;cursor:pointer" id="pv-net"><i class="ti ti-share-3"></i> View in network</div></div>' +
        '</div>' +

        // ---- main ----
        '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:10px">' +
        '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">' +
        kpi("Claims", p.claimCount || claims.length) + kpi("Anomalous visits", flaggedVisits) +
        kpi(hasCase ? "Confirmed · open" : "Open leads", hasCase ? (caseInfo.leadCount + " · " + caseInfo.openCount) : allegs.length) + kpi("Lead exposure", window.DP.usdShort(exposure)) +
        kpi("Total paid", window.DP.usdShort(p.totalPaid || 0)) + '</div>' +

        // report card: radar + drill-down
        '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><div style="font-weight:500;font-size:13px">Provider report card</div>' +
        '<span class="muted" style="font-size:11px">' + outlierCount + ' of ' + groups.length + ' groups are outliers · click a spoke to drill in</span></div>' +
        '<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">' +
        '<div style="flex:none">' + radarSvg(groups, selGroup) + '<div style="display:flex;gap:14px;justify-content:center;font-size:10.5px;color:var(--text2);margin-top:2px"><span><span style="display:inline-block;width:9px;height:9px;background:var(--accent);border-radius:2px;vertical-align:middle"></span> This provider</span><span><span style="display:inline-block;width:10px;height:0;border-top:2px dashed #98a4b3;vertical-align:middle"></span> Peer norm</span></div></div>' +
        '<div style="flex:1;min-width:220px" id="pv-drill">' + drillHtml(p, card, selGroup) + '</div>' +
        '</div></div>' +

        // outlier comparison across providers on the selected group
        '<div class="card" id="pv-compare">' + compareHtml(id, selGroup) + '</div>' +

        // TrackLight-style external profile / secondary scoring
        secondaryPanel(id) +

        // flagged claims — adjudicate from provider
        '<div class="card" style="padding:0;overflow:hidden"><div style="padding:11px 13px 6px;font-weight:500;font-size:13px">' + (hasCase ? 'Leads — case (' + caseInfo.leadCount + ' confirmed · ' + caseInfo.openCount + ' open feeding in)' : 'Leads (' + allegs.length + ' open · no case yet)') + ' <span class="muted" style="font-weight:400;font-size:11px">· confirm a lead to add it to the case</span></div>' +
        '<table><thead><tr><th style="width:22px"></th><th>Risk</th><th>FWA type</th><th>Status</th><th class="right">Exposure</th><th></th></tr></thead><tbody>' +
        (allegs.length ? allegs.slice().sort(function (a, b) { return b.riskScore - a.riskScore; }).map(function (a, i) {
          var cl = a.claimId ? window.DP.getClaim(a.claimId) : null;
          var main = '<tr class="pv-lead" data-i="' + i + '" data-id="' + a.id + '" style="cursor:pointer"><td style="width:22px"><i class="ti ti-chevron-down pv-lcaret" style="color:var(--text3);font-size:13px"></i></td><td>' + window.UI.riskChip(a.riskScore) + '</td><td><span class="tag fwa">' + a.fwaType + '</span> <span class="mono" style="font-size:10.5px;color:var(--text3)">#' + a.id + '</span></td><td>' + window.UI.statusPill(window.UI.leadStatus(a)) + '</td><td class="right" style="font-weight:500">' + window.DP.usd(a.exposurePost || 0) + '</td><td class="right"><span class="pv-review" data-id="' + a.id + '" style="font-size:11px;color:var(--accent-d);cursor:pointer">Review <i class="ti ti-chevron-right"></i></span></td></tr>';
          var detail = '<tr class="pv-ldetail" data-i="' + i + '" style="display:none"><td colspan="6" style="background:var(--surface);padding:10px 13px">' + leadLinesHtml(a, cl) + '</td></tr>';
          return main + detail;
        }).join("") : '<tr><td colspan="6" class="muted" style="padding:12px">No leads.</td></tr>') +
        '</tbody></table></div>' +

        // historical claims
        '<div class="card" style="padding:0;overflow:hidden"><div style="padding:11px 13px 6px;font-weight:500;font-size:13px">Historical claims <span class="muted" style="font-weight:400;font-size:11px">· showing ' + Math.min(claims.length, 10) + ' of ' + claims.length + '</span></div>' +
        '<table><thead><tr><th>Claim</th><th>Type</th><th>DOS</th><th>CPT</th><th class="right">Paid</th></tr></thead><tbody>' +
        claims.slice(0, 10).map(function (c) {
          var flagged = (c.lines || []).some(function (l) { return (l.violatesRuleIds || []).length; });
          return '<tr' + (flagged ? ' style="background:#fdf6f6"' : '') + '><td class="mono" style="font-size:11px">' + c.claimNumber + '</td><td>' + c.type + '</td><td class="mono" style="font-size:11px">' + c.dateOfService + '</td><td class="mono" style="font-size:11px">' + (c.lines || []).map(function (l) { return l.cpt; }).join(", ") + (flagged ? ' <i class="ti ti-flag" style="color:var(--high-tx)"></i>' : '') + '</td><td class="right">' + window.DP.usd(c.paidAmount) + '</td></tr>';
        }).join("") +
        '</tbody></table></div>' +
        '</div></div></div>';

      // ---- wiring ----
      document.getElementById("pv-back").addEventListener("click", function () { window.APP.goBack(); });
      document.getElementById("pv-net").addEventListener("click", function () { window.APP.nav("network"); });
      var pvBiz = document.getElementById("pv-biz"); if (pvBiz) pvBiz.addEventListener("click", function () { window.APP.openBusiness(bizId); });
      document.getElementById("pv-flag").addEventListener("click", function () { window.APP.toggleProviderWatch(id); rerender(id); });
      mount.querySelectorAll("tr.row").forEach(function (tr) { tr.addEventListener("click", function () { window.APP.openAllegation(tr.getAttribute("data-id")); }); });
      // expandable leads: click a lead row to reveal its full claim line items
      mount.querySelectorAll(".pv-lead").forEach(function (tr) {
        tr.addEventListener("click", function () {
          var i = tr.getAttribute("data-i");
          var d = mount.querySelector('.pv-ldetail[data-i="' + i + '"]'); if (!d) return;
          var open = d.style.display !== "none";
          d.style.display = open ? "none" : "table-row";
          var c = tr.querySelector(".pv-lcaret"); if (c) c.style.transform = open ? "" : "rotate(180deg)";
        });
      });
      mount.querySelectorAll(".pv-review").forEach(function (el) { el.addEventListener("click", function (e) { e.stopPropagation(); window.APP.openAllegation(el.getAttribute("data-id")); }); });
      wireRadar(mount, id);

      // ---- report-card export ----
      var gHead = ["Group", "Score", "Peer norm", "Outlier"];
      var gRows = groups.map(function (g) { return [g.group, g.score, g.peer, g.outlier ? "Yes" : "No"]; });
      var aHead = ["Lead", "FWA Type", "Risk", "Status", "Exposure"];
      var aRows = allegs.slice().sort(function (a, b) { return b.riskScore - a.riskScore; }).map(function (a) { return ["#" + a.id, a.fwaType, a.riskScore, a.status, a.exposurePost || 0]; });
      var slug = "report-card-" + (p.name || "provider").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      window.EXPORT.wire("pv", {
        csv: function () { window.EXPORT.csv(slug, gHead, gRows); },
        xls: function () { window.EXPORT.xls(slug, "Report card", gHead, gRows); },
        pdf: function () {
          var body = window.EXPORT.kvHtml([
            ["Provider", p.name], ["NPI", p.npi], ["TIN", p.tin], ["Specialty", p.taxonomyLabel || ""], ["Location", (p.city || "") + ", " + (p.state || "")],
            ["Risk", (p.riskScore || 0) + "/100"], ["Claims", p.claimCount || 0], ["Open flagged", allegs.length]
          ]) +
            (chain ? "<div class='card'><b>Collusion chain:</b> " + window.EXPORT.htmlEsc(p.registration) + " · officer " + window.EXPORT.htmlEsc(p.officer) + " · " + window.EXPORT.htmlEsc(p.registrationId) + "</div>" : "") +
            "<h2>Report card — composite group scores</h2>" + window.EXPORT.tableHtml(gHead, gRows) +
            "<h2>Leads (" + aRows.length + ")</h2>" + window.EXPORT.tableHtml(aHead, aRows.map(function (r) { return r.slice(0, 4).concat([window.DP.usd(r[4])]); }));
          window.EXPORT.pdf("Provider report card — " + p.name, body);
        }
      });
    }
  };

  function rerender(id) { window.Views.provider.render(document.getElementById("view"), { id: id }); }

  // clicking a spoke label re-renders the drill-down + comparison in place
  function wireRadar(mount, id) {
    mount.querySelectorAll("[data-group]").forEach(function (el) {
      el.style.cursor = "pointer";
      el.addEventListener("click", function () {
        selGroup = el.getAttribute("data-group");
        var p = window.DP.getProvider(id), card = window.DP.getReportCard(id);
        document.getElementById("pv-drill").innerHTML = drillHtml(p, card, selGroup);
        document.getElementById("pv-compare").innerHTML = compareHtml(id, selGroup);
        // repaint radar highlight
        var holder = mount.querySelector(".pv-radar-holder");
        if (holder) holder.outerHTML = radarSvg(card.groups, selGroup);
        wireRadar(mount, id);
      });
    });
  }

  // ---- radar / spider SVG ----
  function radarSvg(groups, sel) {
    var n = groups.length; if (!n) return "";
    var W = 300, cx = 150, cy = 150, R = 104;
    var pt = function (i, v) { var ang = -Math.PI / 2 + i * 2 * Math.PI / n; var r = (v / 100) * R; return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]; };
    var grid = [25, 50, 75, 100].map(function (lvl) {
      var pts = groups.map(function (_, i) { return pt(i, lvl).join(","); }).join(" ");
      return '<polygon points="' + pts + '" fill="none" stroke="#e3e8ee" stroke-width="1"></polygon>';
    }).join("");
    var axes = groups.map(function (_, i) { var e = pt(i, 100); return '<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0] + '" y2="' + e[1] + '" stroke="#e3e8ee" stroke-width="1"></line>'; }).join("");
    var peerPts = groups.map(function (g, i) { return pt(i, g.peer).join(","); }).join(" ");
    var provPts = groups.map(function (g, i) { return pt(i, g.score).join(","); }).join(" ");
    var peerPoly = '<polygon points="' + peerPts + '" fill="none" stroke="#98a4b3" stroke-width="1.5" stroke-dasharray="4,3"></polygon>';
    var provPoly = '<polygon points="' + provPts + '" fill="rgba(23,179,166,0.18)" stroke="#17b3a6" stroke-width="2"></polygon>';
    var dots = groups.map(function (g, i) { var c = pt(i, g.score); return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + (g.outlier ? 4.5 : 3) + '" fill="' + (g.outlier ? "#c6362f" : "#17b3a6") + '"></circle>'; }).join("");
    var labels = groups.map(function (g, i) {
      var l = pt(i, 128); var anchor = Math.abs(l[0] - cx) < 12 ? "middle" : (l[0] < cx ? "end" : "start");
      var isSel = g.group === sel;
      var short = g.group.replace(" & ", " &\n").split("\n");
      var nm = g.group === "Charge & Payment" ? "Charge/Pay" : g.group === "Diagnostic Testing" ? "Diagnostic" : g.group === "Distance / Travel" ? "Distance" : g.group;
      return '<g data-group="' + window.APP.esc(g.group) + '"><rect x="' + (anchor === "end" ? l[0] - 64 : anchor === "middle" ? l[0] - 32 : l[0]) + '" y="' + (l[1] - 15) + '" width="64" height="28" fill="' + (isSel ? "rgba(23,179,166,0.12)" : "transparent") + '" rx="4"></rect>' +
        '<text x="' + l[0] + '" y="' + (l[1] - 2) + '" text-anchor="' + anchor + '" font-size="10" font-family="IBM Plex Sans,sans-serif" font-weight="' + (isSel ? "600" : "500") + '" fill="' + (g.outlier ? "#8b1a13" : "#10243b") + '">' + nm + (g.outlier ? " ▲" : "") + '</text>' +
        '<text x="' + l[0] + '" y="' + (l[1] + 10) + '" text-anchor="' + anchor + '" font-size="9.5" font-family="IBM Plex Mono,monospace" fill="#5f6b7a">' + g.score + ' vs ' + g.peer + '</text></g>';
    }).join("");
    return '<div class="pv-radar-holder"><svg viewBox="-56 0 412 300" width="330" height="240" style="display:block">' + grid + axes + peerPoly + provPoly + dots + labels + '</svg></div>';
  }

  // ---- spoke drill-down (attribute values for the selected group) ----
  function drillHtml(p, card, group) {
    if (!group) return '';
    var gs = (card.groups || []).find(function (g) { return g.group === group; }) || {};
    var attrs = (card.attributes || {})[group] || [];
    return '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px"><div style="font-weight:600;font-size:13px">' + window.APP.esc(group) + '</div>' +
      '<span class="chip ' + (gs.outlier ? "rh" : "rl") + '"><span class="s">' + gs.score + '</span> ' + (gs.outlier ? "outlier" : "in range") + '</span>' +
      '<span class="muted" style="font-size:11px">peer norm ' + gs.peer + '</span></div>' +
      '<div style="font-size:11px;color:var(--text2);margin-bottom:8px">' + (gs.outlier ? 'This provider sits well above the peer group on this composite — the attributes below drive the score.' : 'This provider is within the normal peer range on this composite.') + '</div>' +
      (attrs.length ? attrs.map(function (a) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:0.5px solid var(--border2)"><div style="font-size:11.5px' + (a.outlier ? ';color:var(--high-tx);font-weight:500' : '') + '">' + window.APP.esc(a.label) + (a.outlier ? ' <i class="ti ti-flag" style="font-size:11px"></i>' : '') + '</div><div style="text-align:right"><span class="mono" style="font-size:12px;font-weight:500">' + window.APP.esc(a.value) + '</span>' + (a.peer ? ' <span class="mono" style="font-size:10.5px;color:var(--text3)">vs ' + window.APP.esc(a.peer) + '</span>' : '') + '</div></div>';
      }).join("") : '<div class="muted" style="font-size:11.5px">No attribute detail for this group.</div>');
  }

  // ---- outlier comparison: rank providers on the selected group ----
  function compareHtml(id, group) {
    if (!group) return '';
    var rows = window.DP.rankByGroup(group);
    var peer = rows.length ? rows[0].peer : 0;
    var max = rows.length ? rows[0].score : 100;
    var top = rows.slice(0, 8);
    if (!top.find(function (r) { return r.id === id; })) { var me = rows.find(function (r) { return r.id === id; }); if (me) top.push(me); }
    var peerPct = Math.round(peer / Math.max(max, 1) * 100);
    return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-weight:500;font-size:13px">Outlier comparison — ' + window.APP.esc(group) + '</div><span class="muted" style="font-size:11px">how providers differ · peer norm ' + peer + '</span></div>' +
      // peer-norm reference marker labelled above the bars
      '<div style="position:relative;height:15px;margin-bottom:3px"><div style="position:absolute;left:' + peerPct + '%;transform:translateX(-50%);white-space:nowrap;font-size:9.5px;font-weight:600;color:var(--ink)"><i class="ti ti-caret-down-filled" style="font-size:11px;vertical-align:middle"></i> peer norm ' + peer + '</div></div>' +
      top.map(function (r) {
        var self = r.id === id;
        var w = Math.round(r.score / Math.max(max, 1) * 100);
        return '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:3px"><span' + (self ? ' style="font-weight:600;color:var(--accent-d)"' : '') + '>' + window.APP.esc(r.name) + (self ? ' ◀ this provider' : '') + ' <span class="muted" style="font-weight:400">· ' + window.APP.esc(r.specialty || "") + '</span></span><span style="font-weight:500' + (r.outlier ? ';color:var(--high-tx)' : '') + '">' + r.score + '</span></div>' +
          '<div style="height:10px;background:var(--border2);border-radius:4px;position:relative"><div style="height:100%;width:' + w + '%;background:' + (self ? "var(--accent)" : r.outlier ? "var(--high)" : "#c2cad4") + ';border-radius:4px 0 0 4px"></div><div style="position:absolute;left:' + peerPct + '%;top:-2px;bottom:-2px;width:2px;background:var(--ink);border-radius:1px"></div></div></div>';
      }).join("") +
      '<div style="font-size:10.5px;color:var(--text3);margin-top:4px"><i class="ti ti-caret-down-filled" style="color:var(--ink)"></i> Dark line = peer norm (' + peer + '). Red bars = outlier providers; teal = the provider in view.</div>';
  }

  function kpi(l, v) { return '<div class="kpi"><div class="l">' + l + '</div><div class="v">' + v + '</div></div>'; }

  // full claim line-item detail for an expanded lead on the case page
  function leadLinesHtml(a, cl) {
    if (!cl || !(cl.lines || []).length) return '<div style="font-size:11.5px;color:var(--text2)"><i class="ti ti-info-circle"></i> Manual / referral lead — no itemized claim on file yet. Open the lead to attach supporting records.</div>';
    var head = '<div style="font-size:11px;color:var(--text2);margin-bottom:6px"><span class="mono">' + cl.claimNumber + '</span> · ' + cl.type + ' · DOS ' + cl.dateOfService + ' · Dx ' + ((cl.diagnosisCodes || []).join(",") || "—") + ' · billed ' + window.DP.usd(cl.billedAmount) + ' · paid ' + window.DP.usd(cl.paidAmount) + '</div>';
    var rows = cl.lines.map(function (l) {
      var fl = (l.violatesRuleIds || []).length > 0;
      return '<tr' + (fl ? ' style="background:var(--high-bg)"' : '') + '><td class="mono">' + l.cpt + '</td><td>' + window.APP.esc(l.description) + '</td><td>' + ((l.modifiers || []).length ? '<span class="mono" style="background:var(--high-bg);color:var(--high-tx);padding:1px 5px;border-radius:4px">' + l.modifiers.join(",") + '</span>' : "—") + '</td><td class="right">' + l.units + '</td><td class="right">$' + l.billed + '</td><td class="right">$' + l.paid + '</td><td style="font-size:10.5px;white-space:nowrap">' + (fl ? '<span style="color:var(--high-tx)"><i class="ti ti-flag"></i> flagged</span>' : '<span style="color:var(--text3)">clean</span>') + '</td></tr>';
    }).join("");
    return head + '<table style="width:100%"><thead><tr><th>CPT</th><th>Description</th><th>Mod</th><th class="right">Units</th><th class="right">Billed</th><th class="right">Paid</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // ---- TrackLight-style external profile / secondary scoring ----
  function secondaryPanel(id) {
    var s = window.DP.getSecondaryProfile(id); if (!s) return "";
    var b = s.business, o = s.officer;
    var band = s.score >= 75 ? "rh" : s.score >= 50 ? "rm" : "rl";
    var metric = function (label, val, flag) { return '<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-top:0.5px solid var(--border2);font-size:11.5px"><span style="color:var(--text2)">' + label + '</span><span style="font-weight:500' + (flag ? ";color:var(--high-tx)" : "") + '">' + val + '</span></div>'; };
    var osintList = function (arr) {
      return arr.map(function (t) {
        var adverse = !/^No adverse|^No SSA Death/i.test(t);
        return '<div style="display:flex;gap:6px;font-size:11px;color:' + (adverse ? "var(--high-tx)" : "var(--low-tx)") + ';padding:2px 0"><i class="ti ti-' + (adverse ? "alert-triangle" : "circle-check") + '" style="margin-top:1px"></i><span>' + window.APP.esc(t) + '</span></div>';
      }).join("");
    };
    return '<div class="card">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:10px;flex-wrap:wrap">' +
      '<div style="font-weight:500;font-size:13px"><i class="ti ti-world-search" style="color:var(--accent-d)"></i> External profile &amp; secondary scoring <span class="muted" style="font-weight:400;font-size:11px">· TrackLight-style corroboration from outside the claims data (synthetic)</span></div>' +
      '<span class="chip ' + band + '"><span class="s">' + s.score + '</span> secondary risk</span></div>' +
      '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:250px">' +
      '<div style="font-size:11.5px;font-weight:600;margin-bottom:1px"><i class="ti ti-building"></i> Business — ' + window.APP.esc(b.name) + '</div>' +
      '<div class="muted" style="font-size:10.5px;margin-bottom:3px">State registry · OpenCorporates · liens / judgments / bankruptcies · court dockets</div>' +
      metric("Registry status", b.registryStatus + " · " + b.state, b.registryStatus !== "Active") +
      metric("Incorporated · entity #", b.incorporated + " · " + b.entityNo) +
      metric("Related registrations (OpenCorporates)", b.openCorporatesRelated, b.openCorporatesRelated >= 2) +
      metric("Liens", b.liens + (b.liens ? " · " + window.DP.usd(b.lienAmount) : ""), b.liens > 0) +
      metric("Judgments", b.judgments + (b.judgments ? " · " + window.DP.usd(b.judgmentAmount) : ""), b.judgments > 0) +
      metric("Bankruptcies", b.bankruptcies, b.bankruptcies > 0) +
      metric("Court dockets", b.courtDockets, b.courtDockets > 0) +
      '<div style="margin-top:6px">' + osintList(b.osint) + '</div>' +
      '</div>' +
      '<div style="flex:1;min-width:250px">' +
      (o ? '<div style="font-size:11.5px;font-weight:600;margin-bottom:1px"><i class="ti ti-user-search"></i> Individual — ' + window.APP.esc(o.name) + '</div>' +
        '<div class="muted" style="font-size:10.5px;margin-bottom:3px">LexisNexis · Enformion · public records · death-index OSINT</div>' +
        metric("LexisNexis identity confidence", o.lexisConfidence + "%") +
        metric("Associated addresses", o.addresses) +
        metric("Associated businesses (Enformion)", o.enformionBusinesses, o.enformionBusinesses >= 3) +
        metric("Relatives / associates", o.relatives) +
        metric("Professional license", o.licenseStatus) +
        metric("SSA Death Master File", o.ssdiMatch ? "MATCH" : "No match", o.ssdiMatch) +
        '<div style="margin-top:6px">' + osintList(o.osint) + '</div>'
        : '<div style="font-size:11.5px;font-weight:600;margin-bottom:1px"><i class="ti ti-user-search"></i> Individual / officer</div><div class="muted" style="font-size:11px;padding:8px 0">No named officer on the business registration — individual OSINT enrichment not applicable.</div>') +
      '</div></div>' +
      '<div style="font-size:10.5px;color:var(--text3);margin-top:8px"><i class="ti ti-info-circle"></i> Synthetic external data for the demo. Secondary scoring corroborates the claims-based flag with registry, litigation and OSINT signals — the DataProvider seam accepts a real TrackLight / LexisNexis feed.</div>' +
      '</div>';
  }
})();
