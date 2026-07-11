# VA PIVOT Demo — Roadmap / Change List

Derived from the stakeholder demo-review meeting (Patel's notes + Josh + Wendy call). **North star: accelerate
the adjudication of pending claims.** Status of the live demo: analyst + supervisor workflow, network graph,
analytics, provider 360, rules library, audit, guided demo, Supabase login + persistence — all built & deployed.

Legend: **[now]** buildable with synthetic data · **[wendy]** needs Wendy's data (build synthetic placeholder now,
swap later) · **[ext]** external reference (TrackLight/Jack) · effort S/M/L.

**Working copy of record:** `~/dev/pivot-demo` (clone of `ShuaLuke/payment-integrity-demo`, live at
shualuke.github.io/payment-integrity-demo via GitHub Pages from `main`). The `Downloads/va pivot/pivot-demo` copy
is stale (sits at `937ad7b`, 10 commits behind) — do not build there. This roadmap lives in `Downloads/va pivot/`
(canonical planning doc) **and** is committed into the clone so it travels with the repo.

---

## ROUND 2 — Patel / Jack stakeholder review (2026-07-08)

Second review round. Re-sequenced below into build Phases A–F. **Re-baseline note:** Round 1's §1–§10 (below) is
mostly shipped through Sprint 3 (HEAD `b13555b`), so several Round-2 asks are already partly done — status is
called out per phase. Do the **Lead/Case rename (Phase A) first** so later network/AI/editing work isn't built on
soon-to-change vocabulary.

> **STATUS 2026-07-08 — all of Round 2 (Phases A–F) shipped & pushed, HEAD `53a75e1`.** Commits: roadmap `ad700b9`,
> A `7c5db22`, D-comments `d64aa52`, E1/E2/E3 `8e9a8b2`/`c19b36c`/`6a75025`, F `53a75e1`. B & C were verified under
> the new vocab. Each phase committed + pushed separately and verified in-browser.

**Vocabulary shift (stakeholder's words):** Allegation → **"Lead"**, Investigation → **"Case"**. Change
user-facing copy/labels/nav only; keep internal object ids / data keys / method names stable (`openAllegation`,
`state.allegationId`, `D.allegations`, `listAllegations` all unchanged). **Case model (per Patel, 2026-07-08 — RESOLVED):**
a flagged item is a **Lead**; it becomes / joins a **Case** only once it is **reviewed & confirmed** (or escalated).
A Case is **provider-level** — multiple confirmed leads on one provider roll into that provider's single case (new or
existing). Providers with only open leads have **no case yet** (leads "feed in" until confirmed); dismissed leads never
open one. Implemented `e5b592f`: `DP.isCaseLead`, confirmation-gated `DP.listCases`, `CASE_OPENED`/`CASE_UPDATED`
audit on confirm/escalate. **Also:** adjudicators often receive leads **by email or phone** and enter them manually —
`DP.SOURCES` gained Email + Phone/call alongside the existing Create-a-Lead flow.

- **Phase A — Lead/Case model + IA + full-screen** · [now M] · **✅ DONE** (`7c5db22`)
  - Rename to Lead/Case across nav, titles, list headers, copilot/AI copy, audit strings.
  - Cases list (one row per provider with open leads: exposure, risk, lead count) + Case detail rolling up its
    leads. Repurpose `views/investigations.js` + the provider view; add `DP.listCases`/`DP.getCase`.
  - Descriptive lead header: `Lead #20481 · Alamo Internal Medicine — Upcoding` (`views/claim.js`).
  - Use the full screen: raise `.page` max-width (1180 → ~1500 / fluid) + responsive grids (large-monitor reviewer).
- **Phase B — Case tabs (Overview·Evidence·Analysis·Network·Decision)** · **✅ DONE** (Sprint 2 §4, `5aa27b5`) —
  verify only; re-label under new vocab.
- **Phase C — Collusion network on the case view + explainability** · **✅ LARGELY DONE** (Sprint 1 §3, `feaaa2f`) —
  network embedded on the Network tab via `DP.getCollusionNetwork`, plain-language narrative + legend present.
  Remaining: confirm narrative covers both the shared-TIN ring (PR001/PR002) and the residential chain
  (PR300–PR303); tighten `views/network.js` legend/labels if thin.
- **Phase D — AI "Summarize for adjudication" + comments** · **✅ DONE** — summarize action pre-existed (Sprint 1 §5,
  `f27f066`); audit-logged comment/annotation thread ("color commentary") added on the lead (`d64aa52`,
  `APP.addComment`/`getComments`, seeded prior notes).
- **Phase E — Investigator editing + uploads + analyst-created leads** · **✅ DONE** (`8e9a8b2`, `c19b36c`, `6a75025`)
  - E2 `c19b36c` — editable case working-record (TIN, exposure, billed/allowed/paid, claim/provider/veteran) shown
    beside the immutable "claim of record"; every edit logs `RECORD_EDITED` (revert logs `RECORD_REVERTED`).
  - E3 `6a75025` — document-upload affordance on Evidence (real file picker, fake-attach, `DOCUMENT_UPLOADED`);
    "request records" wording is editable + persisted per case with FWA-specific defaults.
  - E1 `8e9a8b2` — Create-a-Lead (analyst-authored, no claim-of-record) + Lead **source taxonomy** (`DP.SOURCES`:
    data-mining · rules · ML/AI · hotline/tip · referral · OIG) + source filter; 3 manual leads seeded.
- **Phase F — TrackLight secondary-scoring enrichment (on the Report Card)** · **✅ DONE** (`53a75e1`) — business-registration
  facet pre-existed (Sprint 3, `c39fb39`); added `DP.getSecondaryProfile` + an "External profile & secondary scoring"
  panel: Business (registry, OpenCorporates, liens/judgments/bankruptcies, court dockets, OSINT) + Individual/officer
  (LexisNexis, Enformion, public records, death-index OSINT). Chain officer Marcus D. Feld / Meridian Behavioral lands
  the narrative (3 registrations · 2 liens · 1 bankruptcy). Seam: `p.secondaryProfile` overrides with a real feed.

**Deferred (note only, don't build):** beneficiary/veteran-side fraud; ingesting Jack's real millions-of-payloads
report-card JSON — keep the `DP` seam shaped to accept it.

**Open item — RESOLVED (2026-07-08):** Patel's "lead → case" definition arrived: *flagged = lead; reviewed &
confirmed = case; multiple leads on one provider feed into one case (new or existing).* Model updated accordingly
(`e5b592f`) — the earlier "a case for every provider with any lead" was replaced with confirmation-gating. Plus:
manual lead entry via **email/call** is a real channel (adjudicators get leads that way) — added as sources.

**Round-2 build order (done):** A → D-comments → E1/E2/E3 → F → B/C verified. ✅ Complete 2026-07-08.

**Next candidates (not yet requested/built):** wire working-record edits into exposure/KPI rollups if desired;
case-level (not just lead-level) notes rollup; regenerate `data.js` to bake the secondary-profile + manual leads in
(currently synthesized in the `DP` layer); await Patel's precise "lead → case" definition.

---

## ROUND 1 — original workstreams (mostly shipped through Sprint 3)

## 1. Terminology & framing
- [now S] Rename **"Pattern Recognition" → "ML / AI models"** everywhere: claim "Source" label, Rules library
  section (currently "pattern-recognition models"), copilot/claim wording. Frame the models as
  **composite anomaly models**.
- [now S] Keep source values as **ML/AI · Rules · Both** (tag already shows "AI" → make it "ML/AI").

## 2. Provider Report Card (headline new feature)
- [now L] Upgrade **Provider 360 → Report Card**.
- [now M] **Radar / spider chart** (Wendy's "FBI spider"): spokes = **group codes**
  (Charge & Payment · Diagnostic Testing · Distance/Travel · Utilization · Coding — reuse FAMS composite groups).
  Show **provider vs peer norm**; highlight **outliers**.
- [now M] **Click a spoke → drill into the attribute values** for that group (per Wendy: select a group, see values).
- [now M] **Outlier comparison** — how all providers differ from one another (ranking / scatter of a chosen metric).
- [now S] **Historical claims** list at the provider level + **visit-count** metric (# visits where the event occurs).
- [now M] **Repeat-offender** indicator + **"Flag provider for future reference"** action (persist to Supabase).
- [now M] **Adjudication can start from a provider** (not only a claim) — provider → its flagged claims.
- [wendy] Real group-code atlas + attribute values + report-card examples.

## 3. Provider network / collusion (make it explainable)
- [now M] Add **plain-language narrative** to the network ("shares 90% of veterans + same TIN/address → likely
  collusion") + clearer legend/labels. Fixes "cool but unexplainable."
- [now L] **Synthetic collusion example**: a **residential-treatment-facility chain** shuffling veterans across
  states (AZ→CA→NV) for **<30-day stays** to bank 30-day charges. Clean **3–4 provider schema**.
- [now S] **Shared-veterans %** metric between providers; **shared TIN/address/officer** edges.
- [now M] **The collusion network lives ON THE CASE VIEW** (flagged-claim screen) as a core panel — NOT hidden in
  Insights. Reviewing a case surfaces its provider's collusion network in-context. (Insights › Network stays as an
  optional broad explorer, but the case view is the primary home.)
- [now M] **Claim → Provider → Network** drill path all reachable from the case (the 3 levels in one place).
- [ext] **Business-registration** facet (fraud businesses) — TrackLight concept; add shared-registration data.
- [wendy] Swap in Wendy's real **3-provider schema + network narrative**; align look to **TrackLight** (Jack's IRS demo).

## 4. Flagged-claim screen restructure ("chop up the screen")
- [now M] Reorganize into cleaner **sections/tabs** (Overview · Evidence · Analysis · Network · Decision).
- [now M] Add **decision-supporting graphs**: E/M distribution vs peers, frequency-over-time, exposure breakdown,
  a **report-card snippet**, and the **embedded network** (from §3).

## 5. AI / adjudication assist
- [now M] Copilot **"Summarize this case for adjudication"** — talks through the anomaly, the evidence, and the
  recommended action.
- [now S] Reference **historical adjudication cases** (existing precedents) in the summary + recommendation.

## 6. Modes: prepay vs retrospective
- [now M] **Prepay view** (pending-claim triage — today's queue) vs **Retrospective view** (more comprehensive:
  provider-level aggregate, historical, whole-population). Toggle at the top.

## 7. Exports (required)
- [now M] Expand exports beyond analytics CSV: **report card, claim, network data, queue → CSV / Excel / PDF.**

## 8. Demo flow / narrative
- [now S] Reframe the guided demo to the stakeholders' flow: **start on Analytics** (what they measure, what an
  outlier looks like) → the claim → **case management** → the claim with **network + report card** visualizations.
- [now S] Emphasize **claim → provider → network** and "**these are not one-offs**" (flagging providers).

## 9. Dataset changes to support the above
- [now M] Per-provider **group-code attributes** (for the radar) — synthetic now.
- [now M] The **residential-facility collusion network** (new providers, cross-state shared vets, short stays).
- [now S] **Business-registration / shared-address** data for the network.
- [now S] Provider-level **watchlist/flagged** state (persist to Supabase — new column/table).
- [now S] **Prepay vs retrospective** data facets; provider historical-claim volumes.

## 10. ~~Carry-over / housekeeping~~ — DROPPED (per Josh: not needed now)

---

## Dependencies (external)
- **Wendy** to send: codes **Atlas**, fabricated data for a couple codes, **anomaly graphs**, **report cards**,
  the **residential-facility example**, the **network narrative / 3-provider schema**, and Daniel's viz set.
- **Jack / TrackLight**: Josh to review the **IRS TrackLight demo**; align network + business-registration feel.

## Sequencing (Round 1 — status)
- **Sprint 1 ✅ shipped:** §1 ML/AI rename · §2 Provider Report Card + spider · §3 network-on-claim + explainability +
  synthetic collusion example · §5 AI case summary.
- **Sprint 2 ✅ shipped:** §4 claim-screen restructure · §6 prepay/retro · §7 exports · §8 demo reframe · §9 data.
- **Sprint 3 ◐ buildable subset shipped:** TrackLight-style business-registration facet + UI polish + `DATA_SPEC.md`
  swap contract. Still blocked on external inputs: Wendy's real data, aligning look to Jack's TrackLight demo.

> Round 2 (Patel/Jack review, 2026-07-08) supersedes this sequencing — see the **ROUND 2** section at the top for
> the current Phase A–F plan and build order.
