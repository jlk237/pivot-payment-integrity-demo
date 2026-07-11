/* Supervisor review — approve or return analyst decisions (Karen Boyd) */
(function () {
  window.Views = window.Views || {};
  window.Views.supervisor = {
    render: function (mount) {
      function draw() {
        var pend = window.APP.pendingReviews();
        mount.innerHTML =
          '<div class="page">' +
          '<div class="page-head"><div><div class="page-title">Supervisor review</div><div class="page-sub">Approve or return analyst decisions before recovery or a case proceeds</div></div>' +
          '<span class="tag"><i class="ti ti-user-shield"></i> Acting as Karen Boyd · Supervisor</span></div>' +
          (pend.length ? pend.map(card).join("") : empty()) +
          '</div>';
        mount.querySelectorAll("[data-appr]").forEach(function (b) {
          b.addEventListener("click", function () { window.APP.supervisorAction(b.getAttribute("data-appr"), "approve"); draw(); });
        });
        mount.querySelectorAll("[data-ret]").forEach(function (b) {
          b.addEventListener("click", function () {
            var note = document.getElementById("ret-" + b.getAttribute("data-ret")).value;
            window.APP.supervisorAction(b.getAttribute("data-ret"), "return", note); draw();
          });
        });
        mount.querySelectorAll("[data-open]").forEach(function (b) {
          b.addEventListener("click", function () { window.APP.openAllegation(b.getAttribute("data-open")); });
        });
      }
      function card(p) {
        var a = p.a, dec = p.dec, out = dec.outcome;
        var outLbl = out === "confirm" ? "Confirm → recovery" : "Escalate → case";
        var outBg = out === "confirm" ? "var(--high-bg)" : "var(--med-bg)";
        var outTx = out === "confirm" ? "var(--high-tx)" : "var(--med-tx)";
        return '<div class="card" style="margin-bottom:10px">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' + window.UI.riskChip(a.riskScore) +
          '<div style="flex:1"><div style="font-weight:500;font-size:13px">' + window.APP.esc(a.provider.name) + ' <span class="mono" style="font-weight:400;color:var(--text2);font-size:11px">#' + a.id + '</span></div>' +
          '<div style="font-size:11px;color:var(--text2);margin-top:2px"><span class="tag fwa">' + a.fwaType + '</span> · ' + window.DP.usd(a.exposurePost) + ' exposure · by ' + window.APP.esc(a.assignee || "Dana Whitmore") + '</div></div>' +
          '<span class="pill" style="background:' + outBg + ';color:' + outTx + '">' + outLbl + '</span></div>' +
          '<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:7px;padding:8px 10px;font-size:11.5px;color:var(--text2);margin-bottom:8px"><span style="color:var(--text3)">Analyst rationale:</span> ' + (dec.rationale ? window.APP.esc(dec.rationale) : '<span style="color:var(--text3)">none provided</span>') + '</div>' +
          '<div style="display:flex;gap:8px;align-items:center">' +
          '<button class="btn" data-open="' + a.id + '"><i class="ti ti-external-link"></i> Open lead</button>' +
          '<input id="ret-' + a.id + '" class="input" placeholder="Return note (optional)…" style="flex:1">' +
          '<button class="btn" data-ret="' + a.id + '"><i class="ti ti-corner-up-left"></i> Return</button>' +
          '<button class="btn primary" data-appr="' + a.id + '" style="background:var(--low);border-color:var(--low)"><i class="ti ti-check"></i> Approve</button>' +
          '</div></div>';
      }
      function empty() {
        return '<div class="card" style="text-align:center;padding:32px"><i class="ti ti-inbox" style="font-size:28px;color:var(--text3)"></i>' +
          '<div style="font-size:13px;color:var(--text2);margin-top:8px">No decisions awaiting review.</div>' +
          '<div style="font-size:11.5px;color:var(--text3);margin-top:3px">Confirm or escalate a lead in the work queue to route it here.</div></div>';
      }
      draw();
    }
  };
  window.Views.approvals = window.Views.supervisor; // Casework > Approvals sub-tab
})();
