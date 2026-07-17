/* Rules Library — read-only rules catalog + pattern models. Rules are classified
   along five dimensions (regulatory source, entity type, fraud type, detection
   level, severity) and can be grouped by any of them. */
(function () {
  window.Views = window.Views || {};
  var groupBy = "fraudType"; // default grouping

  var SEV = {
    Critical: ["var(--high-bg)", "var(--high-tx)"], High: ["#fbe6cf", "#9a5b12"],
    Medium: ["var(--med-bg)", "var(--med-tx)"], Low: ["var(--low-bg)", "var(--low-tx)"]
  };
  function sevPill(s) { var c = SEV[s] || ["var(--surface)", "var(--text2)"]; return '<span class="tag" style="background:' + c[0] + ';color:' + c[1] + '">' + window.APP.esc(s) + '</span>'; }
  function dimTag(icon, val) { return '<span class="tag" style="background:var(--surface)"><i class="ti ti-' + icon + '"></i> ' + window.APP.esc(val) + '</span>'; }

  window.Views.rules = {
    render: function (mount) {
      var rules = window.DP.getRuleCatalog(), models = window.DP.getModels();
      var dims = window.DP.RULE_DIMENSIONS;
      var dim = dims.find(function (d) { return d.key === groupBy; }) || dims[0];

      // group the rules by the active dimension, in the dimension's declared order
      var groups = {};
      rules.forEach(function (r) { var k = r[groupBy] || "—"; (groups[k] = groups[k] || []).push(r); });
      var order = dim.values.filter(function (v) { return groups[v]; }).concat(Object.keys(groups).filter(function (k) { return dim.values.indexOf(k) < 0; }));

      var ruleRow = function (r) {
        return '<div style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:0.5px solid var(--border2)">' +
          '<div style="flex:1;min-width:0"><div style="font-weight:500;font-size:12.5px">' + window.APP.esc(r.name) + ' <span class="mono" style="font-weight:400;font-size:10.5px;color:var(--text3)">' + window.APP.esc(r.code) + '</span></div>' +
          '<div style="font-size:11px;color:var(--text2);margin:2px 0 5px">' + window.APP.esc(r.description) + '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px">' +
          (groupBy !== "regulatorySource" ? dimTag("book", r.regulatorySource) : "") +
          (groupBy !== "entityType" ? dimTag("user", r.entityType) : "") +
          (groupBy !== "fraudType" ? dimTag("alert-triangle", r.fraudType) : "") +
          (groupBy !== "detectionLevel" ? dimTag("stack-2", r.detectionLevel) : "") +
          (groupBy !== "severity" ? sevPill(r.severity) : "") +
          '</div></div>' +
          '<div style="text-align:right;white-space:nowrap;flex:none">' +
          '<div class="mono" style="font-size:11px">v' + window.APP.esc(r.version || "1.0") + '</div>' +
          '<div class="mono" style="font-size:10px;color:var(--text3)">' + window.APP.esc(r.effectiveDate || "—") + '</div>' +
          '<div style="margin-top:3px"><span class="pill" style="background:var(--low-bg);color:var(--low-tx);font-size:10px">' + window.APP.esc(r.environment || "Production") + '</span></div></div>' +
          '</div>';
      };

      var sections = order.map(function (k) {
        var list = groups[k];
        var head = groupBy === "severity" ? sevPill(k) : '<span style="font-weight:600;font-size:12.5px">' + window.APP.esc(k) + '</span>';
        return '<div class="card" style="margin-bottom:8px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">' + head +
          '<span class="muted" style="font-size:11px">' + list.length + ' rule' + (list.length === 1 ? '' : 's') + '</span></div>' +
          list.map(ruleRow).join("") + '</div>';
      }).join("");

      // per-dimension coverage summary (counts by value of the active dimension)
      var chips = dim.values.filter(function (v) { return groups[v]; }).map(function (v) {
        return '<span class="tag" style="background:var(--surface)">' + window.APP.esc(v) + ' <b>' + groups[v].length + '</b></span>';
      }).join(" ");

      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Rules library</div><div class="page-sub">VA-approved compliance rules, pricing logic and ML / AI models — classified by regulatory source, entity type, fraud type, detection level and severity.</div></div>' +
        '<span class="tag"><i class="ti ti-git-branch"></i> dev → test → pre-prod → production</span></div>' +

        '<div class="card" style="margin-bottom:10px"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<span style="font-size:11.5px;color:var(--text2)">Group by</span>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
        dims.map(function (d) { return '<button class="btn r-grp' + (d.key === groupBy ? ' primary' : '') + '" data-dim="' + d.key + '" style="font-size:11px;padding:4px 9px">' + d.label + '</button>'; }).join("") +
        '</div><span style="flex:1"></span><span class="muted" style="font-size:11px">' + rules.length + ' rules</span></div>' +
        '<div style="margin-top:9px;display:flex;flex-wrap:wrap;gap:5px">' + chips + '</div></div>' +

        sections +

        '<div class="card" style="margin-top:10px"><div style="font-weight:500;font-size:13px;margin-bottom:3px">ML / AI models</div><div style="font-size:11px;color:var(--text2);margin-bottom:9px">Composite anomaly models — behavioral detection that complements the hard rule edits above.</div>' +
        models.map(function (m) {
          return '<div style="display:flex;gap:9px;align-items:flex-start;padding:7px 0;border-top:0.5px solid var(--border2)"><i class="ti ti-brain" style="color:var(--accent-d);margin-top:2px"></i>' +
            '<div style="flex:1"><div style="font-size:12.5px;font-weight:500">' + window.APP.esc(m.name) + ' <span class="tag">' + window.APP.esc(m.type) + '</span></div>' +
            '<div style="font-size:11.5px;color:var(--text2)">' + window.APP.esc(m.description) + '</div></div></div>';
        }).join("") + '</div>' +
        '<div style="font-size:11px;color:var(--text2);margin-top:8px">All rules are version-controlled with rollback, and promoted through controlled environments with VA approval before production activation. Read-only view.</div>' +
        '</div>';

      mount.querySelectorAll(".r-grp").forEach(function (b) {
        b.addEventListener("click", function () { groupBy = b.getAttribute("data-dim"); window.Views.rules.render(mount); });
      });
    }
  };
})();
