/* Rules Library — read-only rules + pattern models */
(function () {
  window.Views = window.Views || {};
  window.Views.rules = {
    render: function (mount) {
      var rules = window.DP.getRules(), models = window.DP.getModels();
      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Rules library</div><div class="page-sub">VA-approved compliance rules, pricing logic and ML / AI models</div></div>' +
        '<span class="tag"><i class="ti ti-git-branch"></i> dev → test → pre-prod → production</span></div>' +
        '<div class="card" style="padding:0;overflow:hidden"><table><thead><tr><th>Rule</th><th>Category</th><th>Source authority</th><th>Version</th><th>Effective</th><th>Env</th></tr></thead><tbody>' +
        rules.map(function (r) {
          return '<tr><td><div style="font-weight:500;font-size:12.5px">' + window.APP.esc(r.name) + '</div>' +
            '<div class="mono" style="font-size:10.5px;color:var(--text3)">' + window.APP.esc(r.code) + '</div>' +
            '<div style="font-size:11px;color:var(--text2);margin-top:2px">' + window.APP.esc(r.description) + '</div></td>' +
            '<td><span class="tag">' + window.APP.esc(r.category || "—") + '</span></td>' +
            '<td style="font-size:11.5px">' + window.APP.esc(r.source) + '</td>' +
            '<td class="mono" style="font-size:11.5px">v' + window.APP.esc(r.version || "1.0") + '</td>' +
            '<td class="mono" style="font-size:11px">' + window.APP.esc(r.effectiveDate || "—") + '</td>' +
            '<td><span class="pill p-conf" style="background:var(--low-bg);color:var(--low-tx)">' + window.APP.esc(r.environment || "Production") + '</span></td></tr>';
        }).join("") + '</tbody></table></div>' +
        '<div class="card" style="margin-top:10px"><div style="font-weight:500;font-size:13px;margin-bottom:3px">ML / AI models</div><div style="font-size:11px;color:var(--text2);margin-bottom:9px">Composite anomaly models — behavioral detection that complements the hard rule edits above.</div>' +
        models.map(function (m) {
          return '<div style="display:flex;gap:9px;align-items:flex-start;padding:7px 0;border-top:0.5px solid var(--border2)"><i class="ti ti-brain" style="color:var(--accent-d);margin-top:2px"></i>' +
            '<div style="flex:1"><div style="font-size:12.5px;font-weight:500">' + window.APP.esc(m.name) + ' <span class="tag">' + window.APP.esc(m.type) + '</span></div>' +
            '<div style="font-size:11.5px;color:var(--text2)">' + window.APP.esc(m.description) + '</div></div></div>';
        }).join("") + '</div>' +
        '<div style="font-size:11px;color:var(--text2);margin-top:8px">All rules are version-controlled with rollback, and promoted through controlled environments with VA approval before production activation. Read-only view.</div>' +
        '</div>';
    }
  };
})();
