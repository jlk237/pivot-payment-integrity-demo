/* PIVOT app shell — router, state, audit trail, decision/case-flow. window.APP */
(function () {
  var mount;
  var APP = {
    state: { view: "queue", allegationId: null, filters: {}, decisions: {}, audit: [], investigations: [], role: "analyst", watchlist: {}, businessWatchlist: {}, mode: "retrospective", prepayDecisions: {}, comments: {}, workingRecord: {}, uploads: {}, recordsRequestText: {} },

    ROLES: { analyst: { name: "Dana Whitmore", title: "Analyst", initials: "DW" }, supervisor: { name: "Karen Boyd", title: "Supervisor", initials: "KB" } },
    isSupervisor: function () { return APP.state.role === "supervisor"; },
    setRoleHeader: function () {
      var r = APP.ROLES[APP.state.role];
      var n = document.getElementById("role-name"), t = document.getElementById("role-title"), av = document.getElementById("role-avatar");
      if (n) n.textContent = r.name; if (t) t.textContent = r.title; if (av) av.textContent = r.initials;
    },
    toggleRole: function () { APP.setRole(APP.state.role === "analyst" ? "supervisor" : "analyst"); },
    setRole: function (role) {
      if (APP.state.role === role) return;
      APP.state.role = role;
      APP.setRoleHeader();
      APP.auditLog("ROLE_SWITCH", "Now acting as " + APP.ROLES[role].name + " (" + APP.ROLES[role].title + ")");
      var v = APP.state.view;
      if (role === "analyst" && v === "approvals") v = "queue";
      if (role === "supervisor" && v === "queue") v = "approvals";
      APP.nav(v, { id: APP.state.allegationId });
    },

    fmtTs: function (d) {
      d = d || new Date();
      var p = function (n) { return String(n).padStart(2, "0"); };
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
    },
    esc: function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); },

    ready: false,
    resetDemo: function () { location.reload(); }, // overridden by Supabase integration
    auditLog: function (action, detail) {
      APP.state.audit.unshift({ ts: new Date(), action: action, detail: detail, user: (APP.ROLES[APP.state.role] || {}).name || "Dana Whitmore" });
      var b = document.getElementById("audit-badge");
      if (b) { b.textContent = APP.state.audit.length; b.style.display = APP.state.audit.length ? "inline-block" : "none"; }
    },

    kpis: function () {
      var k = Object.assign({}, window.DP.getKpis());
      var add = 0;
      Object.keys(APP.state.decisions).forEach(function (id) {
        var dec = APP.state.decisions[id];
        // recovery counts only after a supervisor approves the confirmation
        if (dec.outcome === "confirm" && dec.reviewState === "approved") { var a = window.DP.getAllegation(id); if (a) add += a.exposurePost || 0; }
      });
      k.submittedForRecovery = k.submittedForRecovery + add;
      return k;
    },

    // Analyst submits a decision. Confirm/Escalate route to the supervisor queue;
    // Dismiss is analyst-final. Recovery/investigation only fire on supervisor approval.
    applyDecision: function (id, outcome, rationale) {
      var a = window.DP.raw.allegations.find(function (x) { return x.id === id; });
      if (!a) return;
      var final = outcome === "dismiss";
      var status = final ? "Dismissed" : "Pending review";
      var reviewState = final ? "final" : "pending";
      a.status = status; a.assignee = a.assignee || "Dana Whitmore";
      APP.state.decisions[id] = { outcome: outcome, rationale: rationale, ts: new Date(), status: status, reviewState: reviewState };
      APP.auditLog("DECISION_" + outcome.toUpperCase(), "Lead #" + id + " · " + (final ? "Dismissed (false positive)" : outcome) + (rationale ? " · rationale recorded" : ""));
      if (!final) {
        APP.auditLog("SUBMITTED_FOR_REVIEW", "Lead #" + id + " · " + outcome + " → supervisor (Karen Boyd)");
        // the analyst chose (Decision tab) to open a new case or add to an existing one
        var link = (APP.state.caseLinks || {})[id];
        var isNew = !link || String(link).indexOf("new:") === 0;
        var pv = window.DP.getProvider(a.providerId);
        APP.auditLog(isNew ? "CASE_OPENED" : "CASE_UPDATED", "Lead #" + id + " · " + (outcome === "escalate" ? "escalated" : "confirmed") + " → " + (isNew ? "opened a new case" : "added to an existing case") + " for " + a.providerId + (pv ? " (" + pv.name + ")" : ""));
      }
      APP.updateSupBadge();
    },

    // Supervisor approves or returns a pending decision.
    supervisorAction: function (id, action, note) {
      var dec = APP.state.decisions[id]; if (!dec) return;
      var a = window.DP.raw.allegations.find(function (x) { return x.id === id; });
      if (action === "approve") {
        dec.reviewState = "approved";
        a.status = dec.outcome === "confirm" ? "Confirmed" : "Escalated";
        dec.status = a.status;
        APP.auditLog("SUPERVISOR_APPROVED", "Lead #" + id + " · " + a.status + " · approver Karen Boyd");
        if (dec.outcome === "confirm") APP.auditLog("RECOVERY_SUBMITTED", "Lead #" + id + " · " + window.DP.usd(a.exposurePost || 0));
        if (dec.outcome === "escalate") { APP.state.investigations.push(id); APP.auditLog("CASE_OPENED", "Lead #" + id + " · " + a.providerId); }
      } else {
        dec.reviewState = "returned"; dec.returnNote = note || "";
        a.status = "Returned"; dec.status = "Returned";
        APP.auditLog("SUPERVISOR_RETURNED", "Lead #" + id + (note ? " · " + note : ""));
      }
      APP.updateSupBadge();
    },

    pendingReviews: function () {
      return Object.keys(APP.state.decisions)
        .filter(function (id) { return APP.state.decisions[id].reviewState === "pending"; })
        .map(function (id) { return { id: id, dec: APP.state.decisions[id], a: window.DP.getAllegation(id) }; });
    },
    updateSupBadge: function () {
      var n = APP.pendingReviews().length;
      var b = document.getElementById("sup-badge");
      if (b) { b.textContent = n; b.style.display = (n && APP.isSupervisor()) ? "inline-block" : "none"; }
      var sb = document.getElementById("sub-appr-badge");
      if (sb) sb.innerHTML = n ? '<span class="tag" style="background:#c77d11;color:#fff">' + n + '</span>' : "";
    },

    decisionFor: function (id) { return APP.state.decisions[id] || null; },

    ANALYSTS: ["Dana Whitmore", "Maria Delgado", "Devon Carter", "Priya Nair"],
    // Per-analyst profile for supervisor workload management: FWA-type strengths
    // (assign work to whoever is best at it) + performance indicators.
    ANALYST_META: {
      "Dana Whitmore": { strengths: ["Upcoding", "Duplicate claim"], completed: 38, avgDays: 5.8, closedExp2w: 142000 },
      "Maria Delgado": { strengths: ["Unbundling", "Modifier misuse"], completed: 44, avgDays: 6.5, closedExp2w: 98000 },
      "Devon Carter": { strengths: ["Residential length-of-stay abuse", "Kickback / self-referral", "Deceased patient"], completed: 29, avgDays: 8.1, closedExp2w: 210000 },
      "Priya Nair": { strengths: ["Frequency / over-utilization", "Phantom billing", "Billing outside specialty", "Authorization mismatch"], completed: 33, avgDays: 6.9, closedExp2w: 76000 }
    },
    // The analyst who specializes in a given FWA type (for assign-by-strength).
    bestAnalystFor: function (fwaType) {
      var names = APP.ANALYSTS.filter(function (n) { return (APP.ANALYST_META[n] || {}).strengths && APP.ANALYST_META[n].strengths.indexOf(fwaType) >= 0; });
      return names.length ? names[0] : null;
    },
    // Supervisor assigns / reassigns a flagged claim to an analyst (or unassigns).
    assignCase: function (id, name) {
      var a = window.DP.raw.allegations.find(function (x) { return x.id === id; });
      if (!a) return;
      a.assignee = name || null;
      if (name && a.status === "New") a.status = "Assigned";
      APP.auditLog("CASE_ASSIGNED", "Lead #" + id + " · " + (name ? "→ " + name : "unassigned"));
    },
    // Analyst's Decision-tab choice: start a NEW case or add the lead to an existing
    // one. Stored as a per-lead case link that DP.listCases groups by.
    setLeadCase: function (id, choice) {
      choice = choice || {};
      var key = (choice.mode === "existing" && choice.caseKey) ? choice.caseKey : "new:" + id;
      (APP.state.caseLinks = APP.state.caseLinks || {})[id] = key;
      APP.auditLog("CASE_LINK", "Lead #" + id + " · " + (choice.mode === "existing" ? "added to existing case" + (choice.caseName ? " (" + choice.caseName + ")" : "") : "flagged to open a new case"));
    },

    // ---- case closure (a case can be Closed once its work is done) ----
    isCaseClosed: function (pid) { return !!(APP.state.closedCases && APP.state.closedCases[pid]); },
    closeCase: function (pid, reason) {
      (APP.state.closedCases = APP.state.closedCases || {})[pid] = { reason: reason || "Resolved", ts: new Date(), by: (APP.ROLES[APP.state.role] || {}).name };
      var p = window.DP.getProvider(pid);
      APP.auditLog("CASE_CLOSED", "Case " + pid + (p ? " (" + p.name + ")" : "") + (reason ? " · " + reason : ""));
    },
    reopenCase: function (pid) {
      if (APP.state.closedCases) delete APP.state.closedCases[pid];
      APP.auditLog("CASE_REOPENED", "Case " + pid + " reopened");
    },
    openTeam: function (sel) { APP.state.teamSel = sel; APP.nav("team"); },
    openBusiness: function (id) { (APP.state.hist = APP.state.hist || []).push(APP.snapshot()); APP.state.businessId = id; APP.nav("business", { id: id }); },

    // Flag/unflag a business entity (holding company / billing entity) for oversight.
    isBusinessWatched: function (id) { return !!APP.state.businessWatchlist[id]; },
    toggleBusinessWatch: function (id) {
      var b = window.DP.getBusiness(id); if (!b) return false;
      var on = !APP.state.businessWatchlist[id];
      if (on) APP.state.businessWatchlist[id] = true; else delete APP.state.businessWatchlist[id];
      APP.auditLog(on ? "BUSINESS_FLAGGED" : "BUSINESS_UNFLAGGED", b.name + " (" + b.providerCount + " providers)" + (on ? " added to the business watchlist" : " removed from the business watchlist"));
      return on;
    },

    // Flag/unflag a provider for future reference (repeat-offender watchlist).
    isProviderWatched: function (id) { return !!APP.state.watchlist[id]; },
    toggleProviderWatch: function (id) {
      var p = window.DP.getProvider(id); if (!p) return false;
      var on = !APP.state.watchlist[id];
      if (on) APP.state.watchlist[id] = true; else delete APP.state.watchlist[id];
      APP.auditLog(on ? "PROVIDER_FLAGGED" : "PROVIDER_UNFLAGGED", p.name + " (NPI " + (p.npi || "—") + ")" + (on ? " added to watchlist for future reference" : " removed from watchlist"));
      return on;
    },

    // ---- case notes / annotations (analyst "color commentary" on a lead/case) ----
    // Keyed by lead id; every note is written to the audit trail.
    getComments: function (id) { return APP.state.comments[id] || []; },
    addComment: function (id, text) {
      text = (text || "").trim(); if (!text) return null;
      var c = { ts: new Date(), user: (APP.ROLES[APP.state.role] || {}).name || "Dana Whitmore", role: (APP.ROLES[APP.state.role] || {}).title || "Analyst", text: text };
      (APP.state.comments[id] = APP.state.comments[id] || []).push(c);
      APP.auditLog("NOTE_ADDED", "Lead #" + id + " · " + (APP.ROLES[APP.state.role] || {}).title + " note: " + (text.length > 60 ? text.slice(0, 57) + "…" : text));
      return c;
    },

    // ---- document uploads (demo: fake-attach, files are not stored) ----
    getUploads: function (id) { return APP.state.uploads[id] || []; },
    addUpload: function (id, name, size) {
      var u = { name: name || "document", size: size || 0, ts: new Date(), by: (APP.ROLES[APP.state.role] || {}).name || "Dana Whitmore" };
      (APP.state.uploads[id] = APP.state.uploads[id] || []).push(u);
      APP.auditLog("DOCUMENT_UPLOADED", "Lead #" + id + " · attached “" + u.name + "”" + (size ? " (" + Math.max(1, Math.round(size / 1024)) + " KB)" : ""));
      return u;
    },

    // ---- case working record (investigator's editable overlay on the claim of record) ----
    // Values live separately from the immutable claim of record; every edit is audit-logged.
    getWorking: function (id) { return APP.state.workingRecord[id] || {}; },
    setWorking: function (id, field, label, value, recordVal) {
      (APP.state.workingRecord[id] = APP.state.workingRecord[id] || {})[field] = { value: value, recordVal: recordVal, ts: new Date() };
      var r = (recordVal === "" || recordVal == null) ? "(blank)" : recordVal;
      APP.auditLog("RECORD_EDITED", "Lead #" + id + " · " + label + ": " + r + " → " + (value === "" ? "(blank)" : value) + " (working record; claim of record unchanged)");
    },
    clearWorking: function (id, field) { var w = APP.state.workingRecord[id]; if (w && field in w) { delete w[field]; if (!Object.keys(w).length) delete APP.state.workingRecord[id]; } },
    resetWorking: function (id) { if (APP.state.workingRecord[id]) { delete APP.state.workingRecord[id]; APP.auditLog("RECORD_REVERTED", "Lead #" + id + " · working record reverted to the claim of record"); } },

    // ---- analyst-created leads (some leads are manual, not data-driven) ----
    LEAD_SEQ: 0,
    createLead: function (data) {
      data = data || {};
      var p = window.DP.getProvider(data.providerId); if (!p) return null;
      var id = "M" + String(2001 + (APP.LEAD_SEQ++));
      var src = data.sourceType || "Hotline / tip";
      var lead = {
        id: id, providerId: data.providerId, claimId: null,
        fwaType: data.fwaType || "Other / manual",
        riskScore: typeof data.riskScore === "number" ? data.riskScore : 60,
        confidence: 100, source: src, sourceType: src,
        status: "New", mode: "retrospective",
        exposurePost: data.exposure || 0, exposurePre: 0,
        createdDate: new Date().toISOString().slice(0, 10),
        assignee: null, manual: true, createdBy: (APP.ROLES[APP.state.role] || {}).name || "Dana Whitmore",
        xai: { summary: data.rationale ? data.rationale : "Analyst-created lead sourced from " + src + ". Pending evidence linkage and validation." }
      };
      window.DP.raw.allegations.push(lead);
      APP.auditLog("LEAD_CREATED", "Lead #" + id + " · " + p.name + " · source: " + src + (data.fwaType ? " · " + data.fwaType : ""));
      return lead;
    },
    // Pre-adjudicated leads so some CASES exist at load (a case forms only once a
    // lead is reviewed & confirmed/escalated). PR204 gets 2 confirmed + others open
    // to show "multiple leads feeding one case". Idempotent across boots.
    seedCases: function () {
      [
        { pid: "PR204", n: 2, outcome: "confirm" },   // Big Bend — 2 confirmed into one case; remaining leads feed in
        { pid: "PR001", n: 1, outcome: "escalate" },  // Alamo — ring, escalated
        { pid: "PR002", n: 1, outcome: "confirm" },   // Rio Grande — ring
        { pid: "PR300", n: 1, outcome: "escalate" },  // Sonoran — chain
        { pid: "PR200", n: 1, outcome: "confirm" }    // Gulf Coast
      ].forEach(function (pl) {
        var leads = window.DP.listAllegationsByProvider(pl.pid, "retrospective").slice().sort(function (a, b) { return b.riskScore - a.riskScore; });
        var done = 0;
        leads.forEach(function (a) {
          if (done >= pl.n) return;
          if (["Confirmed", "Escalated", "Dismissed", "Pending review"].indexOf(a.status) >= 0) return;
          if (pl.outcome === "escalate") { a.status = "Escalated"; APP.state.decisions[a.id] = { outcome: "escalate", rationale: "Reviewed and escalated — coordinated behavior; opened a provider case.", ts: new Date(), status: "Escalated", reviewState: "approved" }; }
          else { a.status = "Pending review"; APP.state.decisions[a.id] = { outcome: "confirm", rationale: "Reviewed and confirmed improper payment — added to the provider case; recovery pending supervisor approval.", ts: new Date(), status: "Pending review", reviewState: "pending" }; }
          done++;
        });
      });
    },
    // A few manual-origin leads so the "not everything is data-driven" story shows out of the box.
    seedManualLeads: function () {
      [
        { id: "M0007", providerId: "PR205", fwaType: "Phantom billing", src: "Hotline / tip", risk: 74, exp: 8400, by: "OIG Hotline intake", note: "Whistleblower tip: a home-health aide reports visits billed for a veteran who was hospitalized on the service dates. Manual lead — pending records pull." },
        { id: "M0008", providerId: "PR003", fwaType: "Upcoding", src: "Email", risk: 63, exp: 5200, by: "VISN clinical reviewer", note: "Emailed in by a VISN clinical reviewer who noticed consistent level-5 E/M on routine follow-ups. Adjudicator entered it manually — not model-flagged." },
        { id: "M0009", providerId: "PR002", fwaType: "Kickback / self-referral", src: "OIG", risk: 81, exp: 12600, by: "VA-OIG", note: "OIG case referral tied to the shared-TIN ring; potential inducement arrangement. Data mining did not surface this — an investigative referral." },
        { id: "M0010", providerId: "PR206", fwaType: "Duplicate billing", src: "Phone / call", risk: 58, exp: 3900, by: "Provider-relations call line", note: "Phoned in by a beneficiary who was balance-billed for a service the VA already paid. Adjudicator took the call and entered the lead manually." }
      ].forEach(function (s) {
        if (!window.DP.getProvider(s.providerId)) return;
        if (window.DP.raw.allegations.some(function (x) { return x.id === s.id; })) return;
        window.DP.raw.allegations.push({ id: s.id, providerId: s.providerId, claimId: null, fwaType: s.fwaType, riskScore: s.risk, confidence: 100, source: s.src, sourceType: s.src, status: "New", mode: "retrospective", exposurePost: s.exp, exposurePre: 0, createdDate: "2026-07-07", assignee: null, manual: true, createdBy: s.by, xai: { summary: s.note } });
      });
    },

    // ---- prepay vs retrospective (global mode / lens) ----
    // Retrospective = post-payment review & recoupment (the default "pay and report"
    // world). Prepay = pending claims scored BEFORE payment; analyst decides Pay/Hold/Deny.
    mode: function () { return APP.state.mode || "retrospective"; },
    isPrepay: function () { return APP.mode() === "prepay"; },
    setMode: function (m) {
      if (APP.mode() === m) return;
      APP.state.mode = m;
      APP.setModeHeader();
      APP.auditLog("MODE_SWITCH", m === "prepay" ? "Switched to Prepay — pre-payment triage" : "Switched to Retrospective — post-payment review");
      // land on a surface that makes sense for the mode
      var v = APP.state.view;
      if (["queue", "home", "claim", "approvals", "analytics", "provider"].indexOf(v) < 0) v = "home";
      if (APP.isPrepay() && (v === "approvals")) v = "queue";
      APP.nav(v, { id: APP.state.allegationId });
    },
    setModeHeader: function () {
      document.querySelectorAll(".modebtn").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-mode") === APP.mode()); });
      document.body.setAttribute("data-mode", APP.mode());
    },
    prepayDecisionFor: function (id) { return APP.state.prepayDecisions[id] || null; },
    // Analyst triages a pending claim before it is paid.
    prepayDecide: function (id, action) {
      var a = window.DP.raw.allegations.find(function (x) { return x.id === id; });
      if (!a) return;
      var claim = a.claimId ? window.DP.getClaim(a.claimId) : null;
      a.status = { pay: "Cleared to pay", hold: "On hold", deny: "Denied" }[action];
      if (claim) claim.claimStatus = { pay: "Approved for payment", hold: "On hold — records requested", deny: "Denied" }[action];
      APP.state.prepayDecisions[id] = { action: action, ts: new Date(), atRisk: a.exposurePre || 0 };
      APP.auditLog("PREPAY_" + action.toUpperCase(), "Pending claim #" + id + " · " + { pay: "cleared to pay", hold: "held for records", deny: "denied — payment prevented" }[action] + " · " + window.DP.usd(a.exposurePre || 0));
    },
    prepayStats: function () {
      var rows = window.DP.listAllegations({ mode: "prepay" }), dec = APP.state.prepayDecisions;
      var s = { total: rows.length, atRisk: 0, prevented: 0, released: 0, held: 0, pending: 0 };
      rows.forEach(function (r) {
        s.atRisk += r.exposurePre || 0;
        var d = dec[r.id];
        if (!d) s.pending++;
        else if (d.action === "deny") s.prevented += r.exposurePre || 0;
        else if (d.action === "pay") s.released += r.exposurePre || 0;
        else s.held += r.exposurePre || 0;
      });
      return s;
    },

    // ---- information architecture: 4 areas, each with sub-views ----
    SUBS: {
      home: [],
      casework: [{ v: "queue", l: "Leads", role: "analyst" }, { v: "approvals", l: "Approvals", role: "supervisor" }, { v: "team", l: "Team", role: "supervisor" }, { v: "investigations", l: "Cases" }],
      insights: [{ v: "analytics", l: "Overview" }, { v: "network", l: "Network" }, { v: "businesses", l: "Businesses" }, { v: "heatmap", l: "Heatmap" }],
      library: [{ v: "rules", l: "Rules" }, { v: "audit", l: "Audit" }]
    },
    VIEW_AREA: { home: "home", queue: "casework", claim: "casework", investigations: "casework", approvals: "casework", team: "casework", provider: "insights", analytics: "insights", network: "insights", businesses: "insights", business: "insights", heatmap: "insights", rules: "library", audit: "library" },
    subsFor: function (area) { return (APP.SUBS[area] || []).filter(function (s) { return !s.role || s.role === APP.state.role; }); },
    areaOf: function (view) { return APP.VIEW_AREA[view] || "casework"; },
    openArea: function (area) {
      APP.state.hist = []; // top-level navigation starts a fresh trail
      if (area === "home") return APP.nav("home");
      if (area === "casework") return APP.nav(APP.isSupervisor() ? "approvals" : "queue");
      var subs = APP.subsFor(area);
      APP.nav(subs.length ? subs[0].v : area);
    },
    // ---- drill-down history for smart back / breadcrumb ----
    snapshot: function () { return { view: APP.state.view, allegationId: APP.state.allegationId, providerId: APP.state.providerId, businessId: APP.state.businessId }; },
    labelForSnap: function (s) {
      if (!s) return "Work queue";
      if (s.view === "claim") return "Lead #" + s.allegationId;
      if (s.view === "provider") { var p = window.DP.getProvider(s.providerId); return p ? p.name : "Provider"; }
      if (s.view === "business") { var b = window.DP.getBusiness(s.businessId); return b ? b.name : "Business"; }
      var map = { queue: "Leads", home: "Home", investigations: "Cases", approvals: "Approvals", analytics: "Analytics", network: "Network", businesses: "Businesses", heatmap: "Heatmap", rules: "Rules", audit: "Audit" };
      return map[s.view] || "Back";
    },
    backLabel: function () { return APP.state.hist && APP.state.hist.length ? APP.labelForSnap(APP.state.hist[APP.state.hist.length - 1]) : "Leads"; },
    goBack: function () {
      var t = (APP.state.hist || []).pop();
      if (!t) return APP.nav(APP.isSupervisor() ? "approvals" : "queue");
      APP.state.allegationId = t.allegationId; APP.state.providerId = t.providerId; APP.state.businessId = t.businessId;
      APP.nav(t.view, { id: t.allegationId || t.businessId });
    },

    nav: function (view, params) {
      APP.state.view = view;
      var area = APP.areaOf(view);
      document.querySelectorAll(".navitem").forEach(function (n) {
        n.classList.toggle("active", n.getAttribute("data-area") === area);
      });
      APP.renderSubnav(area, view);
      window.scrollTo(0, 0);
      var V = window.Views[view];
      if (V) V.render(mount, params || {});
    },
    renderSubnav: function (area, view) {
      var el = document.getElementById("subnav"); if (!el) return;
      var subs = APP.subsFor(area);
      if (area === "home" || subs.length < 1) { el.style.display = "none"; return; }
      var wsLabel = APP.isSupervisor() && area === "casework" ? '<span style="font-size:11px;color:var(--accent-d);font-weight:500;margin-right:14px"><i class="ti ti-user-shield"></i> Supervisor workspace</span>' : "";
      el.style.display = "block";
      el.innerHTML = '<div style="max-width:var(--page-max);margin:0 auto;padding:0 24px;display:flex;align-items:center;gap:2px">' + wsLabel +
        subs.map(function (s) {
          var active = s.v === view || (view === "claim" && s.v === "queue") || (view === "provider" && s.v === "analytics") || (view === "business" && s.v === "businesses");
          return '<button class="subtab' + (active ? " active" : "") + '" data-view="' + s.v + '">' + s.l + (s.v === "approvals" ? ' <span id="sub-appr-badge"></span>' : "") + '</button>';
        }).join("") + '</div>';
      el.querySelectorAll(".subtab").forEach(function (b) { b.addEventListener("click", function () { APP.nav(b.getAttribute("data-view")); }); });
      APP.updateSupBadge();
    },

    openAllegation: function (id) { (APP.state.hist = APP.state.hist || []).push(APP.snapshot()); APP.state.allegationId = id; APP.nav("claim", { id: id }); },
    openProvider: function (id) { (APP.state.hist = APP.state.hist || []).push(APP.snapshot()); APP.state.providerId = id; APP.nav("provider", { id: id }); },

    boot: function () {
      mount = document.getElementById("view");
      document.getElementById("disclaimer").textContent = window.DP.disclaimer;
      document.querySelectorAll(".navitem").forEach(function (n) {
        n.addEventListener("click", function () { APP.openArea(n.getAttribute("data-area")); });
      });
      var rs = document.getElementById("role-switch");
      if (rs) rs.addEventListener("click", APP.toggleRole);
      var rd = document.getElementById("reset-demo");
      if (rd) rd.addEventListener("click", function () { if (window.confirm("Reset the demo to its initial data? This clears all decisions, case assignments, closures, notes and the audit trail.")) APP.resetDemo(); });
      document.querySelectorAll(".modebtn").forEach(function (b) { b.addEventListener("click", function () { APP.setMode(b.getAttribute("data-mode")); }); });
      APP.setModeHeader();
      APP.setRoleHeader();
      APP.auditLog("SESSION_START", APP.ROLES[APP.state.role].name + " signed in · " + (window.SB && window.SB.enabled ? "authenticated" : "PIV authenticated"));
      APP.seedManualLeads();
      APP.seedCases();
      APP.seedComments();
      APP.nav("home");
      APP.ready = true;
    },
    // A little prior "color commentary" so the thread isn't empty in the demo.
    seedComments: function () {
      var mk = function (mins, name, role, text) { return { ts: new Date(Date.now() - mins * 60000), user: name, role: role, text: text }; };
      APP.state.comments["20481"] = [
        mk(1440, "Maria Delgado", "Analyst", "Pulled the 99215 trend — the 90% level-5 share holds across all 11 months, not a one-quarter blip. Looks systemic."),
        mk(320, "Karen Boyd", "Supervisor", "Agree it's systemic. Before we recover, confirm the linked-diagnosis complexity is genuinely low — attach the med-record excerpt to the case.")
      ];
      APP.state.comments["20544"] = [
        mk(210, "Devon Carter", "Analyst", "Same 7 veterans cycle AZ→CA→NV in <30-day stays. This is the holding-company chain, not a one-off — flag the business too.")
      ];
    }
  };
  window.APP = APP;

  // helpers shared by views
  window.UI = {
    riskChip: function (r) {
      var b = window.DP.band(r), cls = b === "high" ? "rh" : b === "med" ? "rm" : "rl",
        lbl = b === "high" ? "High" : b === "med" ? "Medium" : "Low";
      return '<span class="chip ' + cls + '"><span class="s">' + r + '</span> ' + lbl + '</span>';
    },
    statusPill: function (s) {
      var m = { "New": "p-new", "Assigned": "p-asg", "Under review": "p-rev", "Recommended close": "p-rec", "Confirmed": "p-conf", "Dismissed": "p-dis", "Escalated": "p-esc", "Pending review": "p-pend", "Returned": "p-ret", "Pending": "p-new", "Cleared to pay": "p-dis", "On hold": "p-esc", "Denied": "p-conf", "Pending Case": "p-pend", "Closed": "p-dis" };
      return '<span class="pill ' + (m[s] || "p-asg") + '">' + s + '</span>';
    },
    // A lead's shown status: once it's reviewed & confirmed/escalated it has fed a
    // case, so it reads "Pending Case" (the lead's terminal state) in the queues.
    leadStatus: function (a) { return (window.DP && window.DP.isCaseLead && window.DP.isCaseLead(a)) ? "Pending Case" : a.status; },
    srcTag: function (s) { var lbl = s === "Pattern Recognition" ? "ML/AI" : s === "Rules Engine" ? "Rules" : s === "Both" ? "ML/AI + Rules" : s; return '<span class="muted" style="font-size:10.5px">' + window.APP.esc(lbl) + '</span>'; }
  };

  // Boot is orchestrated by supabase.js (auth gate in Supabase mode, or immediate in local mode).
})();
