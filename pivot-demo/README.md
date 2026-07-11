# PIVOT — demo UI

Static, no-build demo of **VA PIVOT** (Payment Integrity Validation & Oversight Tool). Analyst reviews
post-payment claims flagged as anomalous → aggregate analysis → prioritize → drill into a claim → decide →
update the case flow. VA × IBM identity. **All data is synthetic** (see the banner); NPIs deliberately fail the
NPI check digit, TINs use the `00-` prefix.

## Run
No build step, no dependencies. Serve statically:
```
python3 -m http.server 8137     # then open http://localhost:8137
```
(or just open `index.html`). With no Supabase configured it runs in **local mode** — no login, in-memory state. Enable login + persistence by pointing `assets/config.js` at your own Supabase.

**→ Full from-scratch setup (new machine / new accounts, local · Supabase · GitHub Pages): [`SETUP.md`](SETUP.md).**
Everything environment-specific lives in one file: [`assets/config.js`](assets/config.js).

## Regenerate data
```
npm run gen:data      # -> src/data/dataset.json + assets/data.js (deterministic, seed 20260701)
```

## Deploy (GitHub Pages)
Push this folder to a repo → Settings › Pages › Deploy from branch `main` `/ (root)`. Any static host works too. See [`SETUP.md`](SETUP.md).

## Structure
```
index.html            app shell (chrome, nav, script order)
assets/
  styles.css          design system (locked tokens, PIVOT_DEMO_DESIGN.md §7b)
  data.js             generated: window.PIVOT_DATA
  provider.js         DataProvider seam (window.DP) — swap for Neo4j later, same shapes
  collusion.js        shared collusion analysis + network graph + business-entity node (window.Collusion)
  ai.js               deterministic "Gen AI" (window.AI) — adjudication brief, copilot, rationale
  export.js           zero-dependency CSV / Excel / PDF exports (window.EXPORT)
  app.js              router, state, prepay/retro mode, watchlists, audit, decisions (window.APP)
  views/              home · queue (retro + prepay triage) · claim (tabbed) · provider report card ·
                      businesses (registry + profile) · network · analytics · heatmap · rules · audit · …
scripts/generate-data.mjs   synthetic-data generator (also a Neo4j loader later)
src/data/dataset.json       canonical graph-shaped snapshot
```

## Swappable seams
- `assets/provider.js` — `window.DP`; today reads the JSON snapshot, later a Neo4j provider returns the same shapes.
- `assets/ai.js` — `window.AI`; today deterministic, later a live Gemini/Claude call via a serverless proxy.
- **See [`DATA_SPEC.md`](DATA_SPEC.md)** for the full `window.DP` contract, `window.PIVOT_DATA` shapes, three swap recipes, and where each of Wendy's real-data deliverables drops in. No UI change either way.
