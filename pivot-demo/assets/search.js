/* Global search / command palette — jump to any flagged claim or provider. */
(function () {
  var open = false;

  function results(q) {
    q = q.trim().toLowerCase(); if (!q) return [];
    var out = [];
    window.DP.raw.allegations.forEach(function (a) {
      var p = window.DP.getProvider(a.providerId);
      if ((a.id + " " + p.name + " " + p.npi + " " + a.fwaType).toLowerCase().indexOf(q) >= 0)
        out.push({ type: "claim", id: a.id, label: "#" + a.id + " · " + a.fwaType, sub: p.name + " · NPI " + p.npi, risk: a.riskScore });
    });
    window.DP.listProviders().forEach(function (p) {
      if ((p.name + " " + p.npi).toLowerCase().indexOf(q) >= 0)
        out.push({ type: "provider", id: p.id, label: p.name, sub: (p.taxonomyLabel || "") + " · NPI " + p.npi });
    });
    window.DP.listBusinesses().forEach(function (b) {
      if ((b.name + " " + (b.officer || "") + " " + (b.tin || "")).toLowerCase().indexOf(q) >= 0)
        out.push({ type: "business", id: b.id, label: b.name, sub: b.kind + " · " + b.providerCount + " providers" });
    });
    return out.slice(0, 14);
  }

  function build() {
    var ov = document.createElement("div");
    ov.id = "gs-overlay";
    ov.style.cssText = "position:fixed;inset:0;z-index:300;background:rgba(16,36,59,0.35);display:none;align-items:flex-start;justify-content:center;padding-top:12vh;font-family:'IBM Plex Sans',sans-serif";
    ov.innerHTML =
      '<div id="gs-box" style="width:560px;max-width:92vw;background:var(--card);border:0.5px solid var(--border);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.25);overflow:hidden">' +
      '<div style="display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:0.5px solid var(--border2)"><i class="ti ti-search" style="color:var(--text2)"></i><input id="gs-input" placeholder="Search claims, providers, businesses, NPIs…" style="flex:1;border:none;outline:none;font-size:14px;background:transparent;color:var(--ink);font-family:inherit"><span style="font-size:10px;color:var(--text3);border:0.5px solid var(--border);border-radius:4px;padding:1px 5px">esc</span></div>' +
      '<div id="gs-results" style="max-height:52vh;overflow-y:auto"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.getElementById("gs-input").addEventListener("input", function () { render(this.value); });
    document.getElementById("gs-input").addEventListener("keydown", function (e) { if (e.key === "Escape") close(); if (e.key === "Enter") { var first = document.querySelector(".gs-row"); if (first) first.click(); } });
  }

  function render(q) {
    var list = results(q);
    document.getElementById("gs-results").innerHTML = list.length ? list.map(function (r) {
      var icon = r.type === "claim" ? "flag" : r.type === "business" ? "building-community" : "building-hospital";
      var tag = r.type === "business" ? '<span class="tag">Business</span>' : '<span class="tag">Provider</span>';
      return '<div class="gs-row" data-type="' + r.type + '" data-id="' + r.id + '" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-top:0.5px solid var(--border2)"><i class="ti ti-' + icon + '" style="color:var(--accent-d)"></i>' +
        '<div style="flex:1"><div style="font-size:12.5px;font-weight:500">' + window.APP.esc(r.label) + '</div><div style="font-size:11px;color:var(--text2)">' + window.APP.esc(r.sub) + '</div></div>' +
        (r.risk ? window.UI.riskChip(r.risk) : tag) + '</div>';
    }).join("") : (q.trim() ? '<div class="muted" style="padding:14px;font-size:12.5px">No matches.</div>' : '<div class="muted" style="padding:14px;font-size:12px">Type a claim #, provider, business, or NPI.</div>');
    document.querySelectorAll(".gs-row").forEach(function (row) {
      row.addEventListener("click", function () {
        var t = row.getAttribute("data-type"), id = row.getAttribute("data-id");
        close();
        if (t === "claim") window.APP.openAllegation(id); else if (t === "business") window.APP.openBusiness(id); else window.APP.openProvider(id);
      });
    });
  }

  function openPalette() { open = true; document.getElementById("gs-overlay").style.display = "flex"; var i = document.getElementById("gs-input"); i.value = ""; render(""); setTimeout(function () { i.focus(); }, 10); }
  function close() { open = false; document.getElementById("gs-overlay").style.display = "none"; }

  window.SEARCH = { open: openPalette, close: close };
  function boot() {
    if (!window.APP || !window.DP || !window.APP.ready) return setTimeout(boot, 100);
    build();
    var btn = document.getElementById("gsearch"); if (btn) btn.addEventListener("click", openPalette);
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && !/input|textarea|select/i.test((e.target.tagName || "")) && !open) { e.preventDefault(); openPalette(); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
