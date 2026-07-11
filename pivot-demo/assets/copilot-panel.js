/* Copilot — floating slide-over assistant, available on every screen.
   Scopes to the current claim when you're viewing one, else a default hero case. */
(function () {
  var SUGGEST = ["Summarize this case for adjudication", "How does it compare to peers?", "What's the recommended action?", "Draft a rationale"];
  var open = false;

  function ctx() {
    var id = (window.APP.state.view === "claim" && window.APP.state.allegationId) ? window.APP.state.allegationId : "20481";
    return window.DP.getAllegation(id);
  }
  function focused() { return window.APP.state.view === "claim" && window.APP.state.allegationId; }

  function build() {
    var fab = document.createElement("button");
    fab.id = "cp-fab";
    fab.style.cssText = "position:fixed;bottom:18px;right:18px;z-index:210;background:#0f6e56;color:#fff;border:none;border-radius:26px;padding:10px 16px;font-size:13px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 3px 14px rgba(0,0,0,0.22)";
    fab.innerHTML = '<i class="ti ti-sparkles"></i> Investigative Assistant';
    fab.onclick = toggle;
    document.body.appendChild(fab);

    var panel = document.createElement("div");
    panel.id = "cp-panel";
    panel.style.cssText = "position:fixed;top:0;right:0;width:370px;max-width:92vw;height:100vh;z-index:220;background:var(--card);border-left:0.5px solid var(--border);box-shadow:-4px 0 24px rgba(0,0,0,0.12);transform:translateX(100%);transition:transform .22s ease;display:flex;flex-direction:column;font-family:'IBM Plex Sans',sans-serif";
    panel.innerHTML =
      '<div style="background:#10243b;color:#fff;padding:12px 14px;display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:8px"><i class="ti ti-sparkles" style="color:#7fe0d6"></i><span style="font-weight:500">Investigative Assistant</span></div><button id="cp-x" style="background:none;border:none;color:#93a7bf;cursor:pointer;font-size:16px"><i class="ti ti-x"></i></button></div>' +
      '<div id="cp-ctx" style="padding:7px 14px;font-size:11px;color:var(--text2);border-bottom:0.5px solid var(--border2);background:var(--surface)"></div>' +
      '<div id="cp-chat" class="chat" style="flex:1;overflow-y:auto;padding:12px 14px;min-height:0"></div>' +
      '<div style="padding:10px 14px;border-top:0.5px solid var(--border2)"><div class="suggest" id="cp-suggest" style="margin-bottom:8px"></div>' +
      '<div style="display:flex;gap:8px"><input id="cp-input" class="input" placeholder="Ask the Investigative Assistant…"><button class="btn primary" id="cp-send"><i class="ti ti-send"></i></button></div>' +
      '<div style="font-size:10px;color:var(--text3);margin-top:6px"><i class="ti ti-sparkles"></i> Demonstration-scripted, grounded in the case data.</div></div>';
    document.body.appendChild(panel);

    document.getElementById("cp-x").onclick = toggle;
    document.getElementById("cp-suggest").innerHTML = SUGGEST.map(function (s) { return '<button class="btn" style="font-size:11.5px">' + s + '</button>'; }).join("");
    document.getElementById("cp-suggest").querySelectorAll("button").forEach(function (b) { b.onclick = function () { ask(b.textContent); }; });
    document.getElementById("cp-send").onclick = function () { var i = document.getElementById("cp-input"); ask(i.value.trim()); i.value = ""; };
    document.getElementById("cp-input").addEventListener("keydown", function (e) { if (e.key === "Enter") { ask(this.value.trim()); this.value = ""; } });
  }

  function toggle() {
    open = !open;
    document.getElementById("cp-panel").style.transform = open ? "translateX(0)" : "translateX(100%)";
    document.getElementById("cp-fab").style.display = open ? "none" : "flex";
    if (open) greet();
  }
  function setCtxLine() {
    var a = ctx();
    document.getElementById("cp-ctx").innerHTML = focused()
      ? '<i class="ti ti-focus-2" style="color:var(--accent-d)"></i> Focused on #' + a.id + ' — ' + window.APP.esc(a.provider.name) + ' · ' + a.fwaType
      : '<i class="ti ti-info-circle"></i> General assistant — open a case for its full context';
  }
  function greet() {
    setCtxLine();
    var chat = document.getElementById("cp-chat"); chat.innerHTML = "";
    var a = ctx();
    addAI(focused()
      ? "I'm focused on lead #" + a.id + " — " + a.fwaType.toLowerCase() + " at " + a.provider.name + ". Ask me to summarize the risk, compare to peers, recommend an action, or draft a rationale."
      : "Ask me about any lead. Open a lead and I'll ground my answers in its evidence, rules and network context.", false);
  }
  function addUser(t) { var d = el("msg user", t); chat().appendChild(d); scroll(); }
  function addAI(t, stream) { var d = el("msg ai", ""); chat().appendChild(d); if (stream) window.AI.stream(d, t, scroll); else d.textContent = t; scroll(); }
  function ask(qy) {
    if (!qy) return;
    if (!open) toggle();
    setCtxLine();
    addUser(qy);
    var a = ctx();
    window.APP.auditLog("COPILOT_QUERY", "#" + a.id + " · " + qy);
    if (isAdjIntent(qy)) { thinkThen(function () { addBrief(a); window.APP.auditLog("AI_CASE_SUMMARY", "Lead #" + a.id); }); return; }
    setTimeout(function () { addAI(window.AI.copilot(a, qy), true); }, 200);
  }
  function isAdjIntent(q) { q = (q || "").toLowerCase(); return /summar/.test(q) && /(adjudicat|case|decision|brief)/.test(q); }
  function thinkThen(fn) {
    var d = el("msg ai", "Analyzing the case…"); chat().appendChild(d); scroll();
    setTimeout(function () { d.remove(); fn(); }, 420);
  }
  function chat() { return document.getElementById("cp-chat"); }
  function scroll() { var c = chat(); c.scrollTop = c.scrollHeight; }
  function el(cls, txt) { var d = document.createElement("div"); d.className = cls; if (txt) d.textContent = txt; return d; }

  // ---- structured adjudication brief ----
  function addBrief(a) {
    var s = window.AI.adjudicationSummary(a);
    var wrap = document.createElement("div"); wrap.style.alignSelf = "stretch";
    wrap.innerHTML = briefHtml(s);
    chat().appendChild(wrap); scroll();
    var go = wrap.querySelector('[data-act="go"]'); if (go) go.onclick = function () { applyRec(s.recommendation.action); };
  }
  var REC_STYLE = {
    "confirm": { bg: "var(--high-bg)", tx: "var(--high-tx)", icon: "check", cta: "Open decision · pre-fill Confirm" },
    "confirm-escalate": { bg: "var(--high-bg)", tx: "var(--high-tx)", icon: "check", cta: "Open decision · pre-fill Confirm" },
    "escalate": { bg: "var(--med-bg)", tx: "var(--med-tx)", icon: "arrow-up-right", cta: "Open decision · pre-fill Escalate" },
    "dismiss": { bg: "var(--low-bg)", tx: "var(--low-tx)", icon: "x", cta: "Open decision · pre-fill Dismiss" },
    "request-records": { bg: "var(--accent-l)", tx: "var(--accent-d)", icon: "file-text", cta: "Request additional records" },
    "pay": { bg: "var(--low-bg)", tx: "var(--low-tx)", icon: "check", cta: "Open decision · pre-fill Pay" },
    "hold": { bg: "var(--med-bg)", tx: "var(--med-tx)", icon: "clock-hour-4", cta: "Open decision · pre-fill Hold" },
    "deny": { bg: "var(--high-bg)", tx: "var(--high-tx)", icon: "ban", cta: "Open decision · pre-fill Deny" }
  };
  function sect(title, body) { return '<div><div style="font-weight:600;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--text3);margin-bottom:3px">' + title + '</div><div style="line-height:1.5;color:var(--text);font-size:12px">' + body + '</div></div>'; }
  function briefHtml(s) {
    var rec = s.recommendation, st = REC_STYLE[rec.action] || REC_STYLE.confirm;
    var ev = '<ul style="margin:0;padding-left:15px;line-height:1.55">' + s.evidence.map(function (e) {
      return '<li style="margin-bottom:1px"><span style="color:var(--text2)">' + window.APP.esc(e.label) + ':</span> <span' + (e.outlier ? ' style="color:var(--high-tx);font-weight:500"' : '') + '>' + window.APP.esc(e.detail) + '</span></li>';
    }).join("") + '</ul>';
    var precChips = (s.precedents.cases || []).map(function (c) {
      var conf = c.outcome === "Confirmed";
      return '<span class="pill ' + (conf ? "p-conf" : "p-dis") + '" style="font-size:10px">#' + c.id + ' · ' + c.outcome + '</span>';
    }).join(" ");
    return '<div style="background:var(--card);border:0.5px solid var(--border);border-radius:12px;overflow:hidden">' +
      '<div style="background:#10243b;color:#fff;padding:8px 11px;font-size:11.5px;display:flex;align-items:center;gap:6px"><i class="ti ti-file-analytics" style="color:#7fe0d6"></i> Adjudication brief · #' + s.headline.split("#")[1] + '</div>' +
      '<div style="padding:11px;display:flex;flex-direction:column;gap:10px">' +
      '<div style="display:flex;align-items:center;gap:9px;background:' + st.bg + ';border-radius:8px;padding:8px 10px"><i class="ti ti-' + st.icon + '" style="color:' + st.tx + ';font-size:18px"></i><div style="font-weight:600;color:' + st.tx + ';font-size:12.5px">Recommended: ' + window.APP.esc(rec.label) + '</div></div>' +
      sect("The anomaly", window.APP.esc(s.anomaly)) +
      sect("Evidence", ev) +
      sect(s.isRing ? "Network signal — coordinated" : "Network signal", '<span' + (s.isRing ? ' style="color:var(--high-tx)"' : '') + '><i class="ti ti-affiliate"></i> ' + window.APP.esc(s.network) + '</span>') +
      sect("Precedent", window.APP.esc(s.precedents.text) + (precChips ? '<div style="margin-top:5px;display:flex;gap:5px;flex-wrap:wrap">' + precChips + '</div>' : "")) +
      sect("Why this recommendation", window.APP.esc(rec.rationale)) +
      '<button class="btn primary" data-act="go" style="width:100%;justify-content:center;font-size:12px"><i class="ti ti-arrow-right"></i> ' + st.cta + '</button>' +
      '<div style="font-size:10px;color:var(--text3);text-align:center"><i class="ti ti-sparkles"></i> Demonstration-scripted · grounded in this case\'s evidence &amp; precedent</div>' +
      '</div></div>';
  }
  // Take the analyst to the decision control, pre-selecting the recommended action.
  // The claim view (tabbed) handles switching to the Decision tab + selecting the seg.
  function applyRec(action) {
    if (open) toggle();
    if (window.Views && window.Views.claim && window.Views.claim.gotoDecision) { window.Views.claim.gotoDecision(action); return; }
    if (action === "request-records") { var rq = document.getElementById("c-req"); if (rq) { rq.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(function () { rq.click(); }, 300); } return; }
    var seg = { "confirm": "c", "confirm-escalate": "c", "dismiss": "d", "escalate": "e" }[action];
    setTimeout(function () { var el = document.querySelector('.seg[data-d="' + seg + '"]'); if (el) el.click(); }, 360);
  }

  window.COPILOT = {
    open: function () { if (!open) toggle(); },
    close: function () { if (open) toggle(); },
    isOpen: function () { return open; }, ask: ask,
    summarize: function (id) {
      if (!open) toggle();
      setCtxLine();
      var a = id ? window.DP.getAllegation(id) : ctx();
      addUser("Summarize this case for adjudication");
      thinkThen(function () { addBrief(a); window.APP.auditLog("AI_CASE_SUMMARY", "Lead #" + a.id); });
    }
  };
  function boot() { if (!window.APP || !window.DP || !window.APP.ready) return setTimeout(boot, 100); build(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
