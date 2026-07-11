# PIVOT — data contract & swap guide

The UI never touches raw data directly. It goes through two swappable **seams**, so the
synthetic demo data can be replaced with Wendy's real data (or a live graph DB) without
touching any view:

| Seam | Global | Today | Swap target |
|------|--------|-------|-------------|
| Data | `window.DP` | `DataProvider` reading `window.PIVOT_DATA` (`assets/provider.js`) | `Neo4jProvider` / real dataset — same method contract |
| Gen-AI | `window.AI` | Deterministic scripted text (`assets/ai.js`) | Live Gemini/Claude call behind a proxy — same method names |

To swap data you either (A) regenerate the synthetic set, (B) drop real data into
`window.PIVOT_DATA` matching the shapes below, or (C) implement the `window.DP` methods
against another source. Views only call `window.DP.*`, so any of the three works.

---

## A. Regenerate the synthetic set
```
npm run gen:data     # scripts/generate-data.mjs → src/data/dataset.json + assets/data.js
```
Deterministic (seed `20260701`). Edit `generate-data.mjs` and re-run; **append new
RNG-consuming code at the end** so existing scenarios stay byte-stable.

## B. Drop in real data
Produce a `window.PIVOT_DATA` object with the keys below (any extra fields are ignored).
Set it before `assets/provider.js` loads (replace `assets/data.js`).

### Top-level keys
`meta · providers · veterans · claims · authorizations · payments · rules · models ·
allegations · precedents · trends · peerBenchmarks · kpis · anomalyBreakdown · graph`

### Core record shapes
```jsonc
// provider  (the report-card, radar, business + network facets all read these)
{
  "id":"PR300", "name":"…", "npi":"…", "tin":"00-…",
  "taxonomyCode":"324500000X", "taxonomyLabel":"…", "city":"…", "state":"AZ",
  "role":"hero|peer|background|chain", "flagged":true,
  "claimCount":3, "totalPaid":45440, "openAllegations":1, "riskScore":92,
  // business facet (optional): present ⇒ provider belongs to a holding company
  "officer":"Marcus D. Feld", "registration":"Meridian Behavioral Holdings LLC", "registrationId":"REG-AZ-0098124",
  // report card: FAMS composite groups vs peer norm
  "groupScores":[{"group":"Coding","score":88,"peer":36,"outlier":true}, …],
  "groupAttributes":{"Coding":[{"label":"99215 share","value":"90%","peer":"14%","outlier":true}, …]},
  // 12-month history (retro aggregates / sparklines)
  "history":[{"month":"2025-03","claims":6,"paid":3840,"flagged":1}, …]
}

// claim
{ "id":"C00568","claimNumber":"…","type":"837I|837P|837D","providerId":"PR300","veteranId":"V0004",
  "dateOfService":"2025-01-03","billedAmount":15360,"allowedAmount":15360,"paidAmount":15360,
  "claimStatus":"Paid|Pending","paymentType":"POST|PRE","diagnosisCodes":["F10.20"],
  "lines":[{"cpt":"H0018","modifiers":[],"units":24,"billed":…,"allowed":…,"paid":…,
            "description":"…","violatesRuleIds":["model_los"]}] }

// allegation  (a flag on a claim/provider — the queue + case view)
{ "id":"20544","providerId":"PR300","claimId":"C00568","fwaType":"Residential length-of-stay abuse",
  "riskScore":92,"confidence":87,"source":"Pattern Recognition|Rules Engine|Both",
  "status":"New|Assigned|Under review|Pending|…","assignee":null,"claimType":"837I",
  "exposurePre":0,"exposurePost":22720,
  "mode":"retrospective|prepay","recommendedAction":"pay|hold|deny",   // prepay only
  "modelId":"model_los","ruleIds":["rule_fee"],"createdDate":"2025-07-25",
  "xai":{ "summary":"plain-language why-flagged", "factors":[{"label":"…","value":"…","benchmark":"…"}] } }

// rule / model — { id, code?, name, type|source, category?, description, … }
// precedent — historical adjudicated case: { id, fwaType, provider, specialty, outcome:"Confirmed|Dismissed", recovered, exposure, adjudicatedDate, analyst, note }
// veteran — { id, name, dob, sex, city, state, memberId }
// trend — { month:"2025-01", flagged, exposure, recovered }
// kpis — { openAllegations, closedAllegations, exposurePost, submittedForRecovery, verifiedRecoupment, avgTimeToCompletionDays, … }
// peerBenchmarks — { internal_medicine_em:{ median99215Share:0.14, peerCount:6 } }

// graph — powers the network + collusion + business facets
{ "nodes":[{ "id","type":"Provider|Veteran|Allegation","label","props":{…} }],
  "edges":[{ "type":"SHARES_TIN|SHARES_OFFICER|SHARES_REGISTRATION|REFERRED_TO|SHARES_PATIENT_WITH|TREATED_BY|…",
             "source","target","props":{ "tin"?, "officer"?, "registration"?, "sharedVeterans"?, "veteranId"? } }] }
```

## C. Implement `window.DP` against another source
The views depend only on this method contract (see `assets/provider.js`). A `Neo4jProvider`
returning the same shapes is a drop-in replacement.

```
band(r) · usd(n) · usdShort(n)                         // formatting helpers
getKpis() · getAnomalyBreakdown() · getTrends() · getGraph() · getPeerBenchmark(key)
getProvider(id) · getClaim(id) · getVeteran(id) · getPrecedent(id)
listProviders() · listPeers() · listClaimsByProvider(id) · listInvestigations()
getAllegation(id)            // hydrated: { …allegation, provider, claim, veteran, model, rules[] }
listAllegations({ mode?, fwaType?, status?, source?, minRisk?, query? })   // mode defaults to 'retrospective'
listAllegationsByProvider(id, mode?)
getSimilarAdjudicated(fwaType, limit?)                 // precedents of the same type
getReportCard(id) · getGroups() · rankByGroup(group)  // radar spokes + outlier ranking
getCollusionNetwork(id)      // { providers[], links[], veterans[], vetLinks[], isRing }
listBusinesses({ all? }) · getBusiness(id)            // entities grouped by registration or shared TIN
```

---

## Where Wendy's deliverables land

| Incoming from Wendy | Populates |
|---------------------|-----------|
| Codes **Atlas** + fabricated code data | `CPT` / `DX` / `TAXONOMY` tables + `rules` / `models` in `generate-data.mjs` |
| Real **report cards** | `provider.groupScores` + `provider.groupAttributes` (radar + spoke drill-down) |
| **Anomaly graphs** | `provider.history` + `trends` + the Analysis-tab charts |
| **Residential-facility example** | the `CHAIN` block (providers + `SHARES_OFFICER`/`SHARES_REGISTRATION`/`SHARES_PATIENT_WITH` edges) |
| **3-provider network schema / narrative** | `graph.edges` + `Collusion.analyze` narrative inputs |
| Business-registration data (TrackLight) | `provider.registration` / `registrationId` / `officer` ⇒ `DP.listBusinesses()` |

Everything above is already wired to synthetic stand-ins, so each real artifact is a
data swap — not a code change.
