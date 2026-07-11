/* Audit trail — every analyst action, immutable log */
(function () {
  window.Views = window.Views || {};
  var ICON = {
    SESSION_START: "login", DECISION_CONFIRM: "circle-check", DECISION_DISMISS: "circle-x",
    DECISION_ESCALATE: "arrow-up-right", RECOVERY_SUBMITTED: "cash", INVESTIGATION_OPENED: "folder-plus",
    MEDICAL_RECORD_REQUESTED: "file-text", CLAIM_DATA_REQUESTED: "database", COPILOT_QUERY: "sparkles",
    AI_CASE_SUMMARY: "file-analytics", NETWORK_VIEWED: "affiliate", EXPORT: "download"
  };
  window.Views.audit = {
    render: function (mount) {
      var log = window.APP.state.audit;
      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Audit trail</div><div class="page-sub">Every action is logged for compliance, investigations and oversight</div></div>' +
        '<div style="display:flex;align-items:center;gap:8px"><span class="tag"><i class="ti ti-shield-lock"></i> ' + log.length + ' events · immutable</span>' +
        '<button class="btn" id="audit-reset" style="font-size:11.5px"><i class="ti ti-refresh"></i> Reset demo</button></div></div>' +
        '<div class="card">' +
        (log.length ? log.map(function (e) {
          return '<div class="audit-row"><i class="ti ti-' + (ICON[e.action] || "point") + ' ic"></i>' +
            '<div style="flex:1"><div style="font-size:12.5px"><span style="font-weight:500">' + label(e.action) + '</span> — ' + window.APP.esc(e.detail) + '</div>' +
            '<div style="font-size:11px;color:var(--text3)">' + window.APP.esc(e.user) + '</div></div>' +
            '<div class="ts">' + window.APP.fmtTs(e.ts) + '</div></div>';
        }).join("") : '<div class="muted" style="font-size:12.5px">No actions yet.</div>') +
        '</div></div>';
      var rb = document.getElementById("audit-reset");
      if (rb) rb.addEventListener("click", function () { if (confirm("Reset the demo? This clears all decisions, approvals and the audit trail back to the initial state.")) window.APP.resetDemo(); });
    }
  };
  function label(a) { return a.replace(/_/g, " ").toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }); }
})();
