/* Business entities (TrackLight-style) — the business-fraud lens. A "business" is a
   set of providers under one holding-company registration or a shared TIN. Two views:
   the registry (Insights › Businesses) and a single-business profile. */
(function () {
  window.Views = window.Views || {};

  function kindBadge(b) {
    return b.sharedTin
      ? '<span class="pill" style="background:var(--high-bg);color:var(--high-tx)"><i class="ti ti-id-badge-2"></i> ' + b.kind + '</span>'
      : '<span class="pill" style="background:var(--med-bg);color:var(--med-tx)"><i class="ti ti-building-community"></i> ' + b.kind + '</span>';
  }
  function kpi(l, v) { return '<div class="kpi"><div class="l">' + l + '</div><div class="v">' + v + '</div></div>'; }

  // ---------- registry ----------
  window.Views.businesses = {
    render: function (mount) {
      var biz = window.DP.listBusinesses();
      var watched = biz.filter(function (b) { return window.APP.isBusinessWatched(b.id); }).length;
      var totalProv = biz.reduce(function (s, b) { return s + b.providerCount; }, 0);
      var totalExp = biz.reduce(function (s, b) { return s + b.flaggedExposure; }, 0);

      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Businesses</div><div class="page-sub">Holding companies &amp; shared-TIN billing entities that control multiple providers — the business-fraud lens</div></div>' +
        window.EXPORT.group("bz") + '</div>' +
        '<div class="kpis">' +
        kpi("Multi-provider businesses", biz.length) + kpi("Providers controlled", totalProv) +
        kpi("Combined flagged exposure", window.DP.usdShort(totalExp)) + kpi("On watchlist", watched) +
        '</div>' +
        '<div class="card" style="padding:0;overflow:hidden"><table><thead><tr><th>Business entity</th><th>Officer</th><th>Footprint</th><th class="right">Providers</th><th class="right">Flagged exposure</th><th class="right">Risk</th><th></th></tr></thead><tbody>' +
        (biz.length ? biz.map(function (b) {
          var w = window.APP.isBusinessWatched(b.id);
          return '<tr class="row bz-row" data-id="' + b.id + '"><td><div style="display:flex;align-items:center;gap:7px"><i class="ti ti-' + (b.sharedTin ? "id-badge-2" : "building-community") + '" style="color:' + (b.sharedTin ? "var(--high)" : "var(--med)") + '"></i><div><div style="font-weight:600;font-size:12.5px">' + window.APP.esc(b.name) + (w ? ' <i class="ti ti-bookmark" style="color:var(--med);font-size:12px"></i>' : '') + '</div><div style="font-size:10.5px;color:var(--text3)">' + b.kind + (b.tin ? ' · TIN ' + b.tin : '') + '</div></div></div></td>' +
            '<td style="font-size:11.5px">' + window.APP.esc(b.officer || "—") + '</td>' +
            '<td style="font-size:11.5px;color:var(--text2)">' + b.states.join(" · ") + '</td>' +
            '<td class="right" style="font-weight:500">' + b.providerCount + '</td>' +
            '<td class="right" style="font-weight:500">' + window.DP.usd(b.flaggedExposure) + '</td>' +
            '<td class="right">' + window.UI.riskChip(b.riskScore) + '</td>' +
            '<td class="right"><span style="font-size:11px;color:var(--accent-d)">Open <i class="ti ti-chevron-right"></i></span></td></tr>';
        }).join("") : '<tr><td colspan="7" class="muted" style="padding:16px;text-align:center">No multi-provider business entities.</td></tr>') +
        '</tbody></table></div>' +
        '<div style="margin-top:10px;font-size:12px;color:var(--text2)"><i class="ti ti-info-circle"></i> A single business behind several providers is the classic fraud structure — one owner, many NPIs, coordinated billing. Flag the business, not just the claim.</div>' +
        '</div>';

      mount.querySelectorAll(".bz-row").forEach(function (tr) { tr.addEventListener("click", function () { window.APP.openBusiness(tr.getAttribute("data-id")); }); });
      var bHead = ["Business", "Kind", "Officer", "TIN", "Footprint", "Providers", "Flagged exposure", "Open flags", "Risk"];
      var bRows = function () { return window.DP.listBusinesses().map(function (b) { return [b.name, b.kind, b.officer || "", b.tin || "", b.states.join(" / "), b.providerCount, b.flaggedExposure, b.openAllegations, b.riskScore]; }); };
      window.EXPORT.wire("bz", {
        csv: function () { window.EXPORT.csv("pivot-businesses", bHead, bRows()); },
        xls: function () { window.EXPORT.xls("pivot-businesses", "Businesses", bHead, bRows()); },
        pdf: function () { window.EXPORT.pdf("Business entities — payment integrity", window.EXPORT.tableHtml(bHead, bRows().map(function (r) { return r.slice(0, 6).concat([window.DP.usd(r[6]), r[7], r[8]]); }))); }
      });
    }
  };

  // ---------- single business profile ----------
  window.Views.business = {
    render: function (mount, params) {
      var id = params.id || window.APP.state.businessId;
      var b = window.DP.getBusiness(id);
      if (!b) { mount.innerHTML = '<div class="page"><p>Business not found.</p></div>'; return; }
      var watched = window.APP.isBusinessWatched(id);
      var focus = b.providers[0].id;
      var allegs = [];
      b.providers.forEach(function (p) { window.DP.listAllegationsByProvider(p.id).forEach(function (a) { allegs.push({ a: a, p: p }); }); });
      allegs.sort(function (x, y) { return y.a.riskScore - x.a.riskScore; });

      mount.innerHTML =
        '<div class="page">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap"><span class="btn" id="bz-back" style="padding:5px 9px"><i class="ti ti-arrow-left"></i> ' + window.APP.esc(window.APP.backLabel()) + '</span>' +
        '<span class="page-title">' + window.APP.esc(b.name) + '</span>' + kindBadge(b) + window.UI.riskChip(b.riskScore) +
        (watched ? '<span class="pill" style="background:var(--med-bg);color:var(--med-tx)"><i class="ti ti-bookmark"></i> Watched</span>' : '') +
        '<span style="flex:1"></span>' + window.EXPORT.group("bd") +
        '<button class="btn' + (watched ? ' on' : '') + '" id="bz-flag">' + (watched ? '<i class="ti ti-bookmark-off"></i> Remove from watchlist' : '<i class="ti ti-bookmark"></i> Flag business') + '</button></div>' +

        '<div class="split" style="display:flex;gap:12px;align-items:flex-start">' +
        // left rail
        '<div class="rail" style="width:220px;flex:none;display:flex;flex-direction:column;gap:10px">' +
        '<div class="card"><div class="l" style="font-size:10.5px;color:var(--text2);margin-bottom:6px">' + (b.sharedTin ? "Billing entity" : "Holding company") + '</div>' +
        '<div class="mono" style="font-size:11px;line-height:1.7">' + (b.registrationId ? "Reg " + b.registrationId + "<br>" : "") + "TIN " + b.tin + '</div>' +
        (b.officer ? '<div style="font-size:11.5px;color:var(--text2);margin-top:6px"><i class="ti ti-user-shield"></i> Officer <span style="color:var(--ink);font-weight:500">' + window.APP.esc(b.officer) + '</span></div>' : '') +
        '<div style="font-size:11.5px;color:var(--text2);margin-top:6px"><i class="ti ti-map-pin"></i> ' + b.states.join(" · ") + '</div></div>' +
        '<div class="card"><div class="l" style="font-size:10.5px;color:var(--text2);margin-bottom:7px">At a glance</div>' +
        miniStat("Providers", b.providerCount) + miniStat("Total paid", window.DP.usdShort(b.totalPaid)) + miniStat("Flagged exposure", window.DP.usd(b.flaggedExposure)) + miniStat("Open flags", b.openAllegations) + '</div>' +
        '</div>' +
        // main
        '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:10px">' +
        '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px"><div style="font-weight:500;font-size:13px"><i class="ti ti-affiliate" style="color:var(--high)"></i> Business network</div><span id="bz-net-full" style="font-size:11.5px;color:var(--accent-d);cursor:pointer"><i class="ti ti-arrows-maximize"></i> Open full network</span></div>' +
        '<div id="bz-narr" style="margin-bottom:9px"></div>' +
        '<div id="bz-graph" style="background:var(--surface);border:0.5px solid var(--border);border-radius:8px;overflow:hidden"></div></div>' +
        '<div class="card" style="padding:0;overflow:hidden"><div style="padding:11px 13px 6px;font-weight:500;font-size:13px">Providers under this business (' + b.providerCount + ')</div>' +
        '<table><thead><tr><th>Provider</th><th>Specialty</th><th>State</th><th class="right">Claims</th><th class="right">Risk</th></tr></thead><tbody>' +
        b.providers.map(function (p) { return '<tr class="row pv-row" data-id="' + p.id + '"><td style="font-weight:500;font-size:12px">' + window.APP.esc(p.name) + '<div class="mono" style="font-size:10px;color:var(--text3)">NPI ' + p.npi + ' · TIN ' + p.tin + '</div></td><td style="font-size:11.5px;color:var(--text2)">' + window.APP.esc(p.taxonomyLabel || "") + '</td><td style="font-size:11.5px">' + p.state + '</td><td class="right">' + (p.claimCount || 0) + '</td><td class="right">' + window.UI.riskChip(p.riskScore || 0) + '</td></tr>'; }).join("") +
        '</tbody></table></div>' +
        '<div class="card" style="padding:0;overflow:hidden"><div style="padding:11px 13px 6px;font-weight:500;font-size:13px">Leads across the business (' + allegs.length + ')</div>' +
        '<table><thead><tr><th>Risk</th><th>Provider</th><th>FWA type</th><th>Status</th><th class="right">Exposure</th></tr></thead><tbody>' +
        (allegs.length ? allegs.map(function (r) { return '<tr class="row al-row" data-id="' + r.a.id + '"><td>' + window.UI.riskChip(r.a.riskScore) + '</td><td style="font-size:11.5px">' + window.APP.esc(r.p.name) + '</td><td><span class="tag fwa">' + r.a.fwaType + '</span> <span class="mono" style="font-size:10px;color:var(--text3)">#' + r.a.id + '</span></td><td>' + window.UI.statusPill(r.a.status) + '</td><td class="right" style="font-weight:500">' + window.DP.usd(r.a.exposurePost || 0) + '</td></tr>'; }).join("") : '<tr><td colspan="5" class="muted" style="padding:12px">No leads.</td></tr>') +
        '</tbody></table></div>' +
        '</div></div></div>';

      document.getElementById("bz-back").addEventListener("click", function () { window.APP.goBack(); });
      document.getElementById("bz-flag").addEventListener("click", function () { window.APP.toggleBusinessWatch(id); window.Views.business.render(document.getElementById("view"), { id: id }); });
      document.getElementById("bz-net-full").addEventListener("click", function () { window.APP.nav("network"); });
      mount.querySelectorAll(".pv-row").forEach(function (tr) { tr.addEventListener("click", function () { window.APP.openProvider(tr.getAttribute("data-id")); }); });
      mount.querySelectorAll(".al-row").forEach(function (tr) { tr.addEventListener("click", function () { window.APP.openAllegation(tr.getAttribute("data-id")); }); });

      // network
      var s = window.Collusion ? window.Collusion.analyze(focus) : null;
      if (s) { document.getElementById("bz-narr").innerHTML = window.Collusion.narrativeHtml(s); if (s.isRing) window.Collusion.render(document.getElementById("bz-graph"), focus, { height: 300 }); else document.getElementById("bz-graph").style.display = "none"; }

      // export
      var pHead = ["Provider", "NPI", "TIN", "Specialty", "State", "Claims", "Risk"];
      var pRows = b.providers.map(function (p) { return [p.name, p.npi, p.tin, p.taxonomyLabel || "", p.state, p.claimCount || 0, p.riskScore || 0]; });
      var slug = "business-" + (b.name || "entity").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      window.EXPORT.wire("bd", {
        csv: function () { window.EXPORT.csv(slug, pHead, pRows); },
        xls: function () { window.EXPORT.xls(slug, "Business", pHead, pRows); },
        pdf: function () {
          var body = window.EXPORT.kvHtml([["Business", b.name], ["Kind", b.kind], ["Officer", b.officer || "—"], ["TIN", b.tin], ["Footprint", b.states.join(", ")], ["Providers", b.providerCount], ["Flagged exposure", window.DP.usd(b.flaggedExposure)], ["Risk", b.riskScore + "/100"]]) +
            "<h2>Providers under this business</h2>" + window.EXPORT.tableHtml(pHead, pRows) +
            "<h2>Leads</h2>" + window.EXPORT.tableHtml(["Risk", "Provider", "FWA type", "Status", "Exposure"], allegs.map(function (r) { return [r.a.riskScore, r.p.name, r.a.fwaType, r.a.status, window.DP.usd(r.a.exposurePost || 0)]; }));
          window.EXPORT.pdf("Business entity — " + b.name, body);
        }
      });
    }
  };
  function miniStat(l, v) { return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:0.5px solid var(--border2);font-size:11.5px"><span style="color:var(--text2)">' + l + '</span><span style="font-weight:600">' + v + '</span></div>'; }
})();
