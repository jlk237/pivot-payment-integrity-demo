/* Guided demo ribbon — scripted walkthrough of the 3 scenarios.
   Removable: the × hides it (a floating "Guided demo" pill re-opens). Delete this
   file + its <script> + #demo-ribbon to remove entirely. */
(function () {
  function q(sel) { return document.querySelector(sel); }
  function click(sel) { var e = q(sel); if (e) e.click(); }
  function tab(name) { click('.ctab[data-tab="' + name + '"]'); }
  function closeCopilot() { if (window.COPILOT && window.COPILOT.close) window.COPILOT.close(); }
  function retro() { window.APP.setRole("analyst"); if (window.APP.isPrepay()) window.APP.setMode("retrospective"); }

  // Reframed to the stakeholders' flow: start on Analytics (what we measure, what an
  // outlier looks like) → the provider → the claim → case management → the claim with
  // network + report-card visualizations. Emphasis: claim → provider → network, and
  // "these are not one-offs" (flag the provider, not just the claim).
  var STEPS = [
    { t: "Start with what we measure", n: "Analytics is the oversight lens: exposure & recovery trends, exposure by anomaly type, detection source, and peer comparison. Here Alamo Internal Medicine already stands out — 90% of its E/M visits at level 5 vs a 14% peer norm. That gap is what an outlier looks like.", a: function () { retro(); closeCopilot(); window.APP.nav("analytics"); } },
    { t: "The provider report card", n: "Adjudication can start from the provider, not just a claim. The report card's radar scores each FAMS composite group vs the peer norm — Alamo's Coding and Charge spokes spike as outliers. Click a spoke to drill into the attributes; compare against peers below.", a: function () { retro(); window.APP.openProvider("PR001"); } },
    { t: "Drill to the lead", n: "Claim → provider → network, all reachable in one place. From the provider open its lead #20481. The Overview tab carries the risk, confidence and an Explainable-AI “why this was flagged.”", a: function () { retro(); window.APP.openAllegation("20481"); tab("overview"); } },
    { t: "Priced against CMS", n: "The Pricing tab compares what the provider submitted against CMS reference pricing (via Zellis), line by line. Here the level-5 visit was paid well above the CMS-allowed amount — the recoverable overpayment is called out.", a: function () { retro(); window.APP.openAllegation("20481"); tab("pricing"); } },
    { t: "Checked against clinical guidelines", n: "The Utilization tab runs the claim against Milliman MCG guidelines — level of care, criteria met/not-met and (on facility stays) length-of-stay vs the recommended range. Medical necessity, not just coding.", a: function () { retro(); window.APP.openAllegation("20481"); tab("utilization"); } },
    { t: "Decision-supporting graphs", n: "The Analysis tab rounds it out: 99215 mix vs peers, an exposure breakdown and claim-volume over time — the evidence behind the score. (The peer spider itself lives on the Overview tab.)", a: function () { retro(); window.APP.openAllegation("20481"); tab("analysis"); } },
    { t: "The collusion network — on the case", n: "The network isn't hidden in Insights — it lives on the case. Alamo shares a TIN, 9 referrals and 6 patients with Rio Grande Surgical: one billing entity, coordinated anomalies. The narrative spells out why in plain language.", a: function () { retro(); window.APP.openAllegation("20481"); tab("network"); } },
    { t: "These are not one-offs", n: "Rings aren't isolated. Open #20544 — a residential-treatment chain: four facilities under one holding company (Meridian Behavioral, officer Marcus Feld) cycling the same veterans across AZ→CA→NV for back-to-back sub-30-day stays, under separate TINs to hide the ownership.", a: function () { retro(); window.APP.openAllegation("20544"); tab("network"); } },
    { t: "Flag the business, not just the claim", n: "Insights › Businesses rolls the ring up to the entity behind it. Meridian Behavioral Holdings controls all four facilities across three states — $137k flagged. The graph puts the business at the center; watchlist it and every provider it owns is on the radar. This is the TrackLight business-fraud lens.", a: function () { retro(); window.APP.openBusiness("REG-AZ-0098124"); } },
    { t: "AI summarizes for adjudication", n: "Ask the Investigative Assistant to “Summarize this case for adjudication.” It talks through the anomaly, the evidence, the network signal (“not a one-off”) and a recommended action — citing historical precedents — and its button drops you on the right decision.", a: function () { retro(); window.APP.openAllegation("20544"); if (window.COPILOT) window.COPILOT.summarize("20544"); } },
    { t: "Case management — analyst decides", n: "On the Decision tab the analyst chooses Confirm, then must assign the lead to a case — open a new case or add it to an existing one — drafts the rationale with AI and submits. It routes to a supervisor; the money does NOT move to recovery yet.", a: function () { retro(); closeCopilot(); window.APP.openAllegation("20481"); tab("decision"); } },
    { t: "Supervisor review", n: "Switch to Supervisor (Karen Boyd, top-right) — the workspace changes. Confirmations wait under Casework › Approvals; Approve releases the recovery, Return sends it back. Only approval moves the money.", a: function () { window.APP.setRole("supervisor"); window.APP.nav("approvals"); } },
    { t: "Prepay — stop it before it pays", n: "Flip the top toggle to Prepay. The same models score claims BEFORE payment; the analyst decides Pay · Hold · Deny. Here a $17k chain readmission is denied up front — the improper payment never leaves the VA. Retrospective recovers; prepay prevents.", a: function () { window.APP.setRole("analyst"); window.APP.setMode("prepay"); window.APP.nav("queue"); } },
    { t: "Human-in-the-loop — the legit catch", n: "Not every flag is fraud. #20463 (dialysis) is flagged for frequency but at low 61% confidence; the record shows a standing ESRD dialysis order. The analyst dismisses it — logged for model retraining, $0 recovered. The tool supports judgment, not a wrong accusation.", a: function () { retro(); window.APP.openAllegation("20463"); tab("evidence"); click('.doc-row[data-doc="mr"]'); } },
    { t: "Export & wrap", n: "Every surface — analytics, queue, report card, claim and network — exports to CSV, Excel and PDF. That's the loop the stakeholders asked for: measure → outlier → claim → provider → network → decide, prepay or retrospective.", a: function () { retro(); closeCopilot(); window.APP.nav("analytics"); } }
  ];

  var DEMO = {
    i: 0,
    start: function () { DEMO.show(); DEMO.go(0); },
    show: function () { q("#demo-ribbon").style.display = "block"; var p = q("#demo-pill"); if (p) p.style.display = "none"; },
    hide: function () { q("#demo-ribbon").style.display = "none"; DEMO.pill(); window.APP.auditLog("DEMO_HIDDEN", "Guided demo ribbon dismissed"); },
    go: function (n) {
      DEMO.i = Math.max(0, Math.min(STEPS.length - 1, n));
      var s = STEPS[DEMO.i];
      try { if (s.a) s.a(); } catch (e) {}
      DEMO.render();
    },
    next: function () { if (DEMO.i < STEPS.length - 1) DEMO.go(DEMO.i + 1); },
    prev: function () { if (DEMO.i > 0) DEMO.go(DEMO.i - 1); },
    render: function () {
      var s = STEPS[DEMO.i], n = DEMO.i + 1, N = STEPS.length;
      var dots = STEPS.map(function (_, k) { return '<span data-go="' + k + '" style="width:7px;height:7px;border-radius:50%;cursor:pointer;background:' + (k === DEMO.i ? "#17b3a6" : "rgba(255,255,255,0.25)") + '"></span>'; }).join("");
      q("#demo-ribbon").innerHTML =
        '<div style="max-width:var(--page-max);margin:0 auto;padding:7px 24px">' +
        '<div style="display:flex;align-items:center;gap:12px">' +
        '<div style="display:flex;align-items:center;gap:7px;white-space:nowrap"><i class="ti ti-player-play" style="color:#7fe0d6"></i><span style="font-size:12px;font-weight:500;color:#fff">Guided demo</span><span style="font-size:11px;color:#93a7bf">' + n + '/' + N + '</span></div>' +
        '<div style="flex:1;display:flex;justify-content:center;align-items:center;gap:5px">' + dots + '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap">' +
        '<button id="demo-prev" class="btn" style="padding:4px 9px;font-size:12px;background:rgba(255,255,255,0.1);color:#fff;border-color:rgba(255,255,255,0.25)"' + (DEMO.i === 0 ? " disabled" : "") + '><i class="ti ti-chevron-left"></i></button>' +
        '<button id="demo-next" class="btn" style="padding:4px 11px;font-size:12px;background:#17b3a6;color:#04342c;border-color:#17b3a6"' + (DEMO.i === N - 1 ? " disabled" : "") + '>Next <i class="ti ti-chevron-right"></i></button>' +
        '<button id="demo-close" title="Hide demo" class="btn" style="padding:4px 7px;font-size:12px;background:transparent;color:#93a7bf;border-color:rgba(255,255,255,0.2)"><i class="ti ti-x"></i></button>' +
        '</div></div>' +
        '<div style="font-size:12.5px;color:#cfe0f0;margin-top:5px;line-height:1.45"><span style="font-weight:500;color:#fff">' + s.t + '.</span> ' + s.n + '</div>' +
        '</div>';
      q("#demo-prev").onclick = DEMO.prev;
      q("#demo-next").onclick = DEMO.next;
      q("#demo-close").onclick = DEMO.hide;
      q("#demo-ribbon").querySelectorAll("[data-go]").forEach(function (d) { d.onclick = function () { DEMO.go(+d.getAttribute("data-go")); }; });
    },
    pill: function () {
      var p = q("#demo-pill");
      if (!p) {
        p = document.createElement("button");
        p.id = "demo-pill";
        p.style.cssText = "position:fixed;bottom:18px;left:18px;z-index:200;background:#10243b;color:#fff;border:0.5px solid rgba(255,255,255,0.2);border-radius:22px;padding:8px 14px;font-size:12.5px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:7px;box-shadow:0 2px 12px rgba(0,0,0,0.2)";
        p.innerHTML = '<i class="ti ti-player-play" style="color:#7fe0d6"></i> Guided demo';
        p.onclick = DEMO.start;
        document.body.appendChild(p);
      }
      p.style.display = "flex";
    }
  };
  window.DEMO = DEMO;

  function boot() { if (!window.APP || !window.APP.ready) { return setTimeout(boot, 100); } DEMO.start(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
