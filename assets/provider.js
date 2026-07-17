/* DataProvider — the swappable seam. Reads window.PIVOT_DATA (build-time snapshot).
   Later: a Neo4jProvider returning the same shapes. Attaches to window.DP. */
(function () {
  var D = window.PIVOT_DATA;
  var idx = function (arr) { var o = {}; arr.forEach(function (x) { o[x.id] = x; }); return o; };
  var providers = idx(D.providers), claims = idx(D.claims), veterans = idx(D.veterans),
      rules = idx(D.rules), models = idx(D.models);

  function band(r) { return r >= 80 ? "high" : r >= 50 ? "med" : "low"; }
  // Lead source taxonomy — answers "leads aren't all data-driven; some are manual."
  // data-mining · rules · ML/AI (automated) + hotline/tip · referral · OIG · email · phone (manual).
  var SOURCES = ["ML/AI", "Rules", "Data mining", "Hotline / tip", "Referral", "OIG", "Email", "Phone / call"];
  function sourceOf(a) {
    if (!a) return "ML/AI";
    if (a.sourceType) return a.sourceType;              // explicit (manual / created leads)
    if (a.source === "Rules Engine") return "Rules";
    return "ML/AI";                                     // Pattern Recognition / Both → ML/AI-driven
  }

  // Lead → Case model (Patel's definition): a flagged item is a LEAD; once it is
  // reviewed & CONFIRMED (or escalated) it turns into / joins the provider's CASE.
  // Multiple confirmed leads on one provider roll into one case. Dismissed leads
  // never open a case; still-open leads only "feed in" until they're confirmed.
  var CASE_STATUS = { "Pending review": 1, "Confirmed": 1, "Escalated": 1 };
  var CLOSED_STATUS = { "Dismissed": 1, "Cleared to pay": 1, "Denied": 1 };
  function isCaseLead(a) {
    if (CASE_STATUS[a.status]) return true;
    var dec = window.APP && window.APP.state && window.APP.state.decisions && window.APP.state.decisions[a.id];
    return !!(dec && (dec.outcome === "confirm" || dec.outcome === "escalate"));
  }
  function usd(n) { return "$" + Math.round(n).toLocaleString(); }
  function usdShort(n) {
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + Math.round(n).toLocaleString();
  }

  window.DP = {
    raw: D,
    meta: D.meta,
    disclaimer: D.meta.disclaimer,
    band: band, usd: usd, usdShort: usdShort,
    SOURCES: SOURCES, sourceOf: sourceOf,
    getKpis: function () { return D.kpis; },
    getAnomalyBreakdown: function () { return D.anomalyBreakdown; },
    getGraph: function () { return D.graph; },
    getPeerBenchmark: function (k) { return D.peerBenchmarks[k]; },
    getProvider: function (id) { return providers[id] || null; },
    getClaim: function (id) { return claims[id] || null; },
    getVeteran: function (id) { return veterans[id] || null; },
    listProviders: function () { return D.providers; },
    listPeers: function () { return D.providers.filter(function (p) { return p.role === "peer"; }); },

    // Historical adjudicated cases of the same FWA type, for reviewer precedent.
    getSimilarAdjudicated: function (fwaType, limit) {
      var rows = (D.precedents || []).filter(function (p) { return p.fwaType === fwaType; })
        .sort(function (a, b) { return a.adjudicatedDate < b.adjudicatedDate ? 1 : -1; });
      return typeof limit === "number" ? rows.slice(0, limit) : rows;
    },

    getAllegation: function (id) {
      var a = D.allegations.find(function (x) { return x.id === id; });
      if (!a) return null;
      var provider = providers[a.providerId] || null;
      var claim = a.claimId ? claims[a.claimId] : null;
      var veteran = claim ? veterans[claim.veteranId] : null;
      return Object.assign({}, a, {
        provider: provider, claim: claim, veteran: veteran,
        model: a.modelId ? models[a.modelId] : null,
        rules: (a.ruleIds || []).map(function (rid) { return rules[rid]; }).filter(Boolean)
      });
    },

    listAllegations: function (f) {
      f = f || {};
      var rows = D.allegations.map(function (a) {
        var p = providers[a.providerId];
        return {
          id: a.id, fwaType: a.fwaType, riskScore: a.riskScore, confidence: a.confidence,
          source: a.source, sourceType: sourceOf(a), status: a.status, assignee: a.assignee, claimType: a.claimType,
          exposurePost: a.exposurePost, exposurePre: a.exposurePre, createdDate: a.createdDate, providerId: a.providerId,
          mode: a.mode || "retrospective", recommendedAction: a.recommendedAction, manual: !!a.manual,
          providerName: p ? p.name : "—", providerNpi: p ? p.npi : "", providerState: p ? p.state : "",
          hero: ["20481", "20517", "20463"].indexOf(a.id) >= 0 ? 1 : 0
        };
      });
      // default to the retrospective (post-payment) population; "prepay" or "all" opt in.
      var mode = f.mode || "retrospective";
      if (mode !== "all") rows = rows.filter(function (r) { return r.mode === mode; });
      if (f.fwaType) rows = rows.filter(function (r) { return r.fwaType === f.fwaType; });
      if (f.status) rows = rows.filter(function (r) { return r.status === f.status; });
      if (f.source) rows = rows.filter(function (r) { return r.sourceType === f.source; });
      if (typeof f.minRisk === "number") rows = rows.filter(function (r) { return r.riskScore >= f.minRisk; });
      if (f.query) {
        var q = f.query.toLowerCase();
        rows = rows.filter(function (r) { return [r.providerName, r.fwaType, r.providerNpi, r.id].join(" ").toLowerCase().indexOf(q) >= 0; });
      }
      rows.sort(function (a, b) { return b.riskScore - a.riskScore; });
      return rows;
    },

    getTrends: function () { return D.trends || []; },

    // ---- rule taxonomy (derived, no data regen) ----
    // Every rule is classifiable along five dimensions the compliance program uses.
    // Existing generator rules get their tags here; a few catalog-only rules are
    // appended so each dimension value has real coverage (exclusion, anti-kickback,
    // phantom billing, DME, beneficiary have no firing rule in the seed data).
    RULE_DIMENSIONS: [
      { key: "regulatorySource", label: "Regulatory source", values: ["CMS NCCI edits", "CMS payment rules", "VA CCN policy", "False Claims Act", "Anti-Kickback Statute", "OIG advisories"] },
      { key: "entityType", label: "Entity type", values: ["Provider", "DME supplier", "Beneficiary"] },
      { key: "fraudType", label: "Fraud type", values: ["Upcoding", "Unbundling", "Phantom billing", "Medically unnecessary", "Duplicate billing", "Exclusion violations", "Kickback / self-referral", "Authorization / coverage", "Overpayment / pricing", "Workflow"] },
      { key: "detectionLevel", label: "Detection level", values: ["Claim-level", "Provider-pattern", "Network-level"] },
      { key: "severity", label: "Severity", values: ["Critical", "High", "Medium", "Low"] }
    ],
    // taxonomy for the 8 generator rules, keyed by rule id
    RULE_TAXONOMY: {
      rule_ncci_43235_43239: { regulatorySource: "CMS NCCI edits", entityType: "Provider", fraudType: "Unbundling", detectionLevel: "Claim-level", severity: "High" },
      rule_mue: { regulatorySource: "CMS NCCI edits", entityType: "Provider", fraudType: "Medically unnecessary", detectionLevel: "Claim-level", severity: "Medium" },
      rule_mod59: { regulatorySource: "CMS NCCI edits", entityType: "Provider", fraudType: "Unbundling", detectionLevel: "Provider-pattern", severity: "High" },
      rule_mppr: { regulatorySource: "CMS payment rules", entityType: "Provider", fraudType: "Overpayment / pricing", detectionLevel: "Claim-level", severity: "Low" },
      rule_fee: { regulatorySource: "VA CCN policy", entityType: "Provider", fraudType: "Overpayment / pricing", detectionLevel: "Claim-level", severity: "Medium" },
      rule_dup: { regulatorySource: "VA CCN policy", entityType: "Provider", fraudType: "Duplicate billing", detectionLevel: "Claim-level", severity: "High" },
      rule_auth: { regulatorySource: "VA CCN policy", entityType: "Provider", fraudType: "Authorization / coverage", detectionLevel: "Claim-level", severity: "Medium" },
      rule_payreport: { regulatorySource: "VA CCN policy", entityType: "Provider", fraudType: "Workflow", detectionLevel: "Claim-level", severity: "Low" }
    },
    // catalog-only rules that broaden coverage across every dimension
    RULE_CATALOG_EXTRA: [
      { id: "rule_em_level", code: "EM-LEVEL", name: "E/M level validation", source: "CMS payment rules", category: "Coding", description: "Evaluation & management level billed exceeds the documented history/exam/decision-making and the provider's peer-group distribution.", version: "2.1", effectiveDate: "2025-01-01", environment: "Production", regulatorySource: "CMS payment rules", entityType: "Provider", fraudType: "Upcoding", detectionLevel: "Provider-pattern", severity: "High" },
      { id: "rule_phantom", code: "SVC-RENDERED", name: "Services-not-rendered screen", source: "False Claims Act", category: "Integrity", description: "Billed service has no corroborating encounter, attendance or delivery record for the date of service.", version: "1.3", effectiveDate: "2024-11-01", environment: "Production", regulatorySource: "False Claims Act", entityType: "Provider", fraudType: "Phantom billing", detectionLevel: "Claim-level", severity: "Critical" },
      { id: "rule_mednec", code: "MED-NEC", name: "Medical-necessity / level-of-care", source: "VA CCN policy", category: "Coverage", description: "Level of care or length of stay exceeds clinical criteria (MCG) for the documented condition.", version: "1.6", effectiveDate: "2024-12-01", environment: "Production", regulatorySource: "VA CCN policy", entityType: "Provider", fraudType: "Medically unnecessary", detectionLevel: "Provider-pattern", severity: "High" },
      { id: "rule_excl", code: "EXCL-LEIE", name: "OIG LEIE exclusion screening", source: "OIG advisories", category: "Integrity", description: "Rendering or billing provider (or ordering physician) appears on the OIG List of Excluded Individuals/Entities — claims paid during exclusion are recoverable in full.", version: "2.0", effectiveDate: "2025-01-01", environment: "Production", regulatorySource: "OIG advisories", entityType: "Provider", fraudType: "Exclusion violations", detectionLevel: "Provider-pattern", severity: "Critical" },
      { id: "rule_aks", code: "AKS-STARK", name: "Anti-kickback / self-referral", source: "Anti-Kickback Statute", category: "Integrity", description: "Referral or financial-arrangement pattern between linked entities indicates a prohibited inducement or self-referral.", version: "1.1", effectiveDate: "2024-10-15", environment: "Production", regulatorySource: "Anti-Kickback Statute", entityType: "Provider", fraudType: "Kickback / self-referral", detectionLevel: "Network-level", severity: "Critical" },
      { id: "rule_dme", code: "DME-NEC", name: "DME medical necessity & delivery", source: "VA CCN policy", category: "Coverage", description: "Durable medical equipment billed without a supporting order, proof of delivery, or documented medical necessity.", version: "1.2", effectiveDate: "2024-09-15", environment: "Production", regulatorySource: "VA CCN policy", entityType: "DME supplier", fraudType: "Medically unnecessary", detectionLevel: "Claim-level", severity: "Medium" },
      { id: "rule_benelig", code: "BEN-ELIG", name: "Beneficiary eligibility & identity", source: "VA CCN policy", category: "Coverage", description: "Service billed for a date the beneficiary was ineligible, deceased, or where identity could not be verified.", version: "1.0", effectiveDate: "2025-02-01", environment: "Production", regulatorySource: "VA CCN policy", entityType: "Beneficiary", fraudType: "Phantom billing", detectionLevel: "Claim-level", severity: "High" }
    ],
    ruleTaxonomyFor: function (id) { return this.RULE_TAXONOMY[id] || null; },
    // full catalog: generator rules enriched with taxonomy + the catalog-only rules.
    getRuleCatalog: function () {
      var tax = this.RULE_TAXONOMY;
      var base = (D.rules || []).map(function (r) { return Object.assign({}, r, tax[r.id] || {}); });
      return base.concat(this.RULE_CATALOG_EXTRA);
    },
    getRules: function () { return D.rules; },
    getModels: function () { return D.models; },
    getPrecedent: function (pid) { return (D.precedents || []).find(function (p) { return p.id === pid; }) || null; },
    // ---- business entities (TrackLight-style): providers grouped by a shared
    // business registration (holding company) or a shared TIN (one billing entity). ----
    listBusinesses: function (opts) {
      opts = opts || {};
      var groups = {};
      D.providers.forEach(function (p) {
        var key = p.registrationId || p.tin;
        var g = groups[key] || (groups[key] = { id: key, providers: [], regName: p.registration || null, officer: p.officer || null, tin: p.tin });
        g.providers.push(p);
      });
      return Object.keys(groups).map(function (k) { return groups[k]; })
        .filter(function (g) { return opts.all ? true : g.providers.length >= 2; })
        .map(function (g) {
          var provs = g.providers;
          var allegs = []; provs.forEach(function (p) { D.allegations.forEach(function (a) { if (a.providerId === p.id && (a.mode || "retrospective") === "retrospective") allegs.push(a); }); });
          return {
            id: g.id, name: g.regName || ("Billing entity · TIN " + g.tin),
            kind: g.regName ? "Holding company" : "Shared-TIN billing entity",
            officer: g.officer, registrationId: g.regName ? g.id : null, tin: g.regName ? provs[0].tin : g.tin,
            sharedTin: !g.regName, providers: provs, providerCount: provs.length,
            states: provs.map(function (p) { return p.state; }).filter(function (s, i, a) { return s && a.indexOf(s) === i; }),
            totalPaid: provs.reduce(function (s, p) { return s + (p.totalPaid || 0); }, 0),
            flaggedExposure: allegs.reduce(function (s, a) { return s + (a.exposurePost || 0); }, 0),
            openAllegations: allegs.length,
            riskScore: Math.max.apply(null, provs.map(function (p) { return p.riskScore || 0; }).concat([0]))
          };
        }).sort(function (a, b) { return b.flaggedExposure - a.flaggedExposure; });
    },
    getBusiness: function (id) { return this.listBusinesses({ all: true }).find(function (b) { return b.id === id; }) || null; },

    listClaimsByProvider: function (providerId) { return D.claims.filter(function (c) { return c.providerId === providerId; }); },
    listAllegationsByProvider: function (providerId, mode) { return D.allegations.filter(function (a) { return a.providerId === providerId && (mode === "all" || (a.mode || "retrospective") === (mode || "retrospective")); }); },
    listInvestigations: function () { return D.allegations.filter(function (a) { return a.status === "Escalated"; }); },
    isCaseLead: isCaseLead,

    // ---- Cases (provider-level) ----------------------------------------------
    // A Case exists for a provider ONLY once ≥1 of its leads is reviewed & confirmed
    // (or escalated). It aggregates that provider's confirmed leads; the provider's
    // still-open leads "feed in" (they join the case if/when confirmed). `listCases`
    // = one row per provider that HAS a case; `getCase` = that provider (or a shell
    // with leadCount 0 if no case yet). Internal keys stay "allegation".
    listCases: function (opts) {
      opts = opts || {};
      var mode = opts.mode || "retrospective";
      var exposureKey = mode === "prepay" ? "exposurePre" : "exposurePost";
      var closedOf = function (pid) { return !!(window.APP && window.APP.isCaseClosed && window.APP.isCaseClosed(pid)); };
      // A lead's case key: the analyst's EXPLICIT case link (chosen on the Decision
      // tab — new case or an existing one) if set, else the provider's ring key
      // (shared registration / TIN → one multi-provider case) or its own solo case.
      var ringKey = function (pid) {
        var p = providers[pid] || {};
        if (p.registrationId) return "reg:" + p.registrationId;
        var sharedTin = p.tin && D.providers.filter(function (x) { return x.tin === p.tin; }).length > 1;
        return sharedTin ? "tin:" + p.tin : "solo:" + pid;
      };
      var linkOf = function (id) { return (window.APP && window.APP.state.caseLinks && window.APP.state.caseLinks[id]) || null; };
      var keyOf = function (a) { return linkOf(a.id) || ringKey(a.providerId); };
      // group leads (confirmed + still-open) by resolved case key
      var groups = {};
      D.allegations.forEach(function (a) {
        if (mode !== "all" && (a.mode || "retrospective") !== mode) return;
        var k = keyOf(a);
        var g = groups[k] || (groups[k] = { caseLeads: [], openLeads: [] });
        if (isCaseLead(a)) g.caseLeads.push(a);
        else if (!CLOSED_STATUS[a.status]) g.openLeads.push(a);
      });
      var byRisk = function (a, b) { return b.riskScore - a.riskScore; };
      return Object.keys(groups).map(function (k) {
        var g = groups[k];
        var caseLeads = g.caseLeads.slice().sort(byRisk);
        var src = (caseLeads.length ? caseLeads : g.openLeads).slice().sort(byRisk);
        var provIds = src.map(function (a) { return a.providerId; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
        var primary = providers[(src[0] || {}).providerId] || {};
        var escalated = caseLeads.some(function (a) { return a.status === "Escalated"; });
        var closed = provIds.some(closedOf);
        return {
          caseKey: k,
          providerId: primary.id, provider: primary, name: primary.name || "—", npi: primary.npi || "", state: primary.state || "",
          providerIds: provIds, providers: provIds.map(function (pid) { return providers[pid] || {}; }),
          multiProvider: provIds.length > 1, providerCount: provIds.length,
          leads: caseLeads, caseLeads: caseLeads, openLeads: g.openLeads,
          leadCount: caseLeads.length, openCount: g.openLeads.length,
          exposure: caseLeads.reduce(function (s, a) { return s + (a[exposureKey] || 0); }, 0),
          riskScore: Math.max.apply(null, caseLeads.map(function (a) { return a.riskScore || 0; }).concat([0])),
          fwaTypes: caseLeads.map(function (a) { return a.fwaType; }).filter(function (t, i, arr) { return t && arr.indexOf(t) === i; }),
          assignee: (caseLeads.find(function (a) { return a.assignee; }) || {}).assignee || null,
          escalated: escalated, closed: closed,
          status: closed ? "Closed" : escalated ? "Under investigation" : "Open case"
        };
      }).filter(function (c) { return opts.all ? true : c.leadCount > 0; })
        .sort(function (a, b) { return b.exposure - a.exposure; });
    },
    getCase: function (providerId, mode) { return this.listCases({ all: true, mode: mode || "all" }).find(function (c) { return c.providerId === providerId || (c.providerIds && c.providerIds.indexOf(providerId) >= 0); }) || null; },

    // ---- TrackLight-style secondary scoring / external enrichment --------------
    // Synthetic external-data profile (business registry + individual/officer OSINT)
    // used to corroborate a claims-based flag with outside signals. Deterministic
    // per provider. Seam: a real feed can populate p.secondaryProfile to override.
    getSecondaryProfile: function (id) {
      var p = providers[id]; if (!p) return null;
      if (p.secondaryProfile) return p.secondaryProfile;
      var seed = 0; for (var i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
      var rnd = function () { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
      var money = function (min, max) { return Math.round((min + rnd() * (max - min)) / 1000) * 1000; };
      var chain = p.role === "chain";
      var ring = D.providers.filter(function (x) { return x.tin === p.tin; }).length > 1;
      var tier = chain ? "chain" : ring ? "ring" : (p.riskScore || 0) >= 78 ? "risky" : "clean";
      var base = { chain: { regs: 3, liens: 2, judg: 1, bank: 1, dock: 2, score: 88 }, ring: { regs: 2, liens: 1, judg: 1, bank: 0, dock: 1, score: 73 }, risky: { regs: 1, liens: 1, judg: 0, bank: 0, dock: 1, score: 61 }, clean: { regs: 0, liens: 0, judg: 0, bank: 0, dock: 0, score: 24 } }[tier];
      var bizOsint = [];
      if (chain) { bizOsint.push("Registered agent shared with 3 affiliated facilities"); bizOsint.push("Principal address is a commercial mail-drop (CMRA)"); }
      else if (ring) { bizOsint.push("Suite # matches an unrelated billing company at the same address"); }
      else if (tier === "risky") { bizOsint.push("No active web presence; listed phone disconnected"); }
      else { bizOsint.push("No adverse business records found"); }
      var offOsint = [];
      if (p.officer) {
        if (chain) { offOsint.push("Named on " + base.regs + " other active registrations (Enformion)"); offOsint.push("Linked to a dissolved behavioral-health entity (2019)"); }
        else if (ring) { offOsint.push("Associated with the partner provider on state filings"); }
        offOsint.push("No SSA Death Master File match");
      }
      return {
        tier: tier, score: Math.min(99, base.score + Math.floor(rnd() * 8)),
        business: {
          name: p.registration || ("Billing entity · TIN " + p.tin),
          registryStatus: tier === "risky" ? "Delinquent" : "Active",
          state: p.state || "—",
          incorporated: (2011 + Math.floor(rnd() * 11)) + "-" + String(1 + Math.floor(rnd() * 9)).padStart(2, "0"),
          entityNo: (p.state || "US") + "-" + (1000000 + Math.floor(rnd() * 8999999)),
          openCorporatesRelated: base.regs,
          liens: base.liens, lienAmount: base.liens ? money(8000, 90000) : 0,
          judgments: base.judg, judgmentAmount: base.judg ? money(5000, 120000) : 0,
          bankruptcies: base.bank,
          courtDockets: base.dock,
          osint: bizOsint
        },
        officer: p.officer ? {
          name: p.officer,
          lexisConfidence: 82 + Math.floor(rnd() * 17),
          addresses: 2 + Math.floor(rnd() * 4),
          enformionBusinesses: base.regs + 1 + Math.floor(rnd() * 2),
          relatives: 2 + Math.floor(rnd() * 5),
          licenseStatus: chain ? "Active — 3 states" : "Active",
          ssdiMatch: false,
          osint: offOsint
        } : null
      };
    },

    // ---- licensure & credentials (incl. OIG LEIE exclusion) ----
    // Derived here (static, seeded per provider — no data.js regen). Identifiers are
    // impossible-to-be-real by construction: license numbers carry a 0000 block, DEA
    // numbers deliberately fail the checksum. Excluded-while-billing is an automatic
    // finding, so the OIG LEIE exclusions are a small curated list (LEIE is itself a
    // specific list) and surface as the headline credential signal.
    LEIE_EXCLUSIONS: {
      PR301: { basis: "1128(b)(4)", reason: "Licensure revocation / suspension in another state", since: "2024-08-19", reinstatement: null, npiOnList: true },
      PR205: { basis: "1128(a)(3)", reason: "Felony conviction — health-care fraud", since: "2023-11-02", reinstatement: "2028-11-02", npiOnList: true }
    },
    getLicensure: function (id) {
      var p = providers[id]; if (!p) return null;
      var tax = p.taxonomyCode || "";
      var isOrg = /^3/.test(tax) || /^28/.test(tax) || /^251/.test(tax);
      var seed = 0; for (var i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
      var rnd = function () { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
      var yr = function (min, max) { return (min + Math.floor(rnd() * (max - min + 1))); };
      var n4 = function () { return String(1000 + Math.floor(rnd() * 8999)); };
      var st = p.state || "TX";
      var excl = this.LEIE_EXCLUSIONS[id] || null;
      var risk = p.riskScore || 0;

      // Credential friction is reserved for high-risk providers so a clean peer reads
      // as genuinely clear. A lapsed license/DEA/board cert is a softer signal than
      // exclusion; a revalidation-due is benign/administrative. Deterministic per seed.
      var lapse = !excl && risk >= 82 && rnd() > 0.45;
      var deaExpired = !excl && risk >= 82 && rnd() > 0.5;
      var boardExpired = !excl && risk >= 85 && rnd() > 0.5;
      var revalDue = !excl && risk >= 65 && rnd() > 0.5;

      var creds = [];
      if (isOrg) {
        creds.push({ type: "State facility license", authority: st + " Dept. of Health", number: st + "-FAC-0000" + n4().slice(-3), status: (excl ? "Suspended" : lapse ? "Lapsed — renewal pending" : "Active"), expires: yr(2026, 2028) + "-0" + (1 + Math.floor(rnd() * 8)) + "-15" });
        creds.push({ type: "Accreditation", authority: rnd() > 0.5 ? "CARF" : "The Joint Commission", number: "ACR-0000" + n4().slice(-3), status: excl ? "Under review" : "Accredited", expires: yr(2026, 2027) + "-11-30" });
      } else {
        creds.push({ type: "State medical license", authority: st + " Medical Board", number: st + "-MD-0000" + n4().slice(-3), status: (excl ? "Suspended" : lapse ? "Lapsed — renewal pending" : "Active"), expires: yr(2026, 2028) + "-0" + (1 + Math.floor(rnd() * 8)) + "-31" });
        creds.push({ type: "DEA registration", authority: "DEA", number: "B" + String.fromCharCode(65 + Math.floor(rnd() * 26)) + "0000000", status: (excl ? "Retired" : deaExpired ? "Expired" : "Active"), expires: yr(2025, 2027) + "-06-30" });
        creds.push({ type: "Board certification", authority: p.taxonomyLabel || "Specialty board", number: "ABMS-0000" + n4().slice(-3), status: excl ? "Not certified" : boardExpired ? "Expired" : "Certified", expires: yr(2026, 2030) + "-12-31" });
      }
      creds.push({ type: "Medicare/PECOS enrollment", authority: "CMS", number: "PECOS-" + (p.npi || id), status: excl ? "Deactivated" : revalDue ? "Revalidation due" : "Enrolled", expires: revalDue ? yr(2026, 2026) + "-09-30" : yr(2027, 2028) + "-03-31" });

      // alerts, most severe first
      var alerts = [];
      if (excl) alerts.push({ sev: "high", text: "OIG LEIE exclusion — excluded from all federal health-care programs; claims paid during exclusion are recoverable in full." });
      creds.forEach(function (c) {
        if (/Suspended|Lapsed|Expired|Deactivated|Retired|Under review/.test(c.status) && !(excl && c.status === "Suspended"))
          alerts.push({ sev: c.status === "Expired" && c.type === "Board certification" ? "med" : "med", text: c.type + " " + c.status.toLowerCase() + " (" + c.authority + ")." });
        if (c.status === "Revalidation due") alerts.push({ sev: "low", text: "Medicare revalidation due " + c.expires + "." });
      });

      return {
        isOrg: isOrg,
        entityType: isOrg ? "Facility / organization" : "Individual practitioner",
        credentials: creds,
        exclusion: excl ? { basis: excl.basis, reason: excl.reason, since: excl.since, reinstatement: excl.reinstatement, npiOnList: excl.npiOnList } : null,
        excluded: !!excl,
        alerts: alerts,
        // a benign revalidation-due (low sev) alone does not warrant "Action needed"
        status: excl ? "Excluded" : alerts.some(function (x) { return x.sev !== "low"; }) ? "Action needed" : "Clear"
      };
    },
    isExcluded: function (id) { return !!this.LEIE_EXCLUSIONS[id]; },

    // ---- provider report card (radar spokes + drill-down) ----
    getGroups: function () { var p = D.providers.find(function (x) { return x.groupScores; }); return p ? p.groupScores.map(function (g) { return g.group; }) : []; },
    getReportCard: function (id) { var p = providers[id]; return p ? { groups: p.groupScores || [], attributes: p.groupAttributes || {} } : null; },
    // Providers ranked by a single group's score (outlier comparison / ranking).
    rankByGroup: function (group) {
      return D.providers.filter(function (p) { return p.groupScores; })
        .map(function (p) { var gs = p.groupScores.find(function (g) { return g.group === group; }); return { id: p.id, name: p.name, specialty: p.taxonomyLabel, role: p.role, score: gs ? gs.score : 0, peer: gs ? gs.peer : 0, outlier: gs ? gs.outlier : false }; })
        .sort(function (a, b) { return b.score - a.score; });
    },

    // ---- collusion network: providers connected to `id` by shared identifiers ----
    // Traverses SHARES_TIN / SHARES_OFFICER / SHARES_REGISTRATION / REFERRED_TO /
    // SHARES_PATIENT_WITH (provider↔provider) plus TREATED_BY (veteran→provider).
    getCollusionNetwork: function (id) {
      var provEdge = { SHARES_TIN: 1, SHARES_OFFICER: 1, SHARES_REGISTRATION: 1, REFERRED_TO: 1, SHARES_PATIENT_WITH: 1 };
      var E = D.graph.edges, adj = {};
      E.forEach(function (e) {
        if (provEdge[e.type] && providers[e.source] && providers[e.target]) {
          (adj[e.source] = adj[e.source] || []).push(e.target);
          (adj[e.target] = adj[e.target] || []).push(e.source);
        }
      });
      var seen = {}, queue = [id]; seen[id] = 1;
      while (queue.length) { var cur = queue.shift(); (adj[cur] || []).forEach(function (n) { if (!seen[n]) { seen[n] = 1; queue.push(n); } }); }
      var provIds = Object.keys(seen);
      var links = E.filter(function (e) { return provEdge[e.type] && seen[e.source] && seen[e.target]; });
      var vetLinks = E.filter(function (e) { return e.type === "TREATED_BY" && seen[e.target] && veterans[e.source]; });
      var vetSeen = {}; vetLinks.forEach(function (e) { vetSeen[e.source] = 1; });
      return {
        providers: provIds.map(function (x) { return providers[x]; }),
        links: links,
        veterans: Object.keys(vetSeen).map(function (x) { return veterans[x]; }),
        vetLinks: vetLinks,
        isRing: provIds.length > 1
      };
    },

    // ---- 837 EDI / CMS Pricing (Zellis) / Utilization Mgmt (Milliman) mocks ----
    // Deterministic per-claim synthetic data. Seams for real third-party feeds:
    // a real 837 parser, the Zellis pricing service, and Milliman MCG guidelines.
    _seed: function (id, salt) { var s = 0; id = String(id) + (salt || ""); for (var i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) >>> 0; return function () { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }; },

    // Map an internal claim to X12 837 loops/segments (837P professional / 837I institutional).
    get837: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      var p = providers[cl.providerId] || {}, ve = veterans[cl.veteranId] || {};
      var inst = cl.type === "837I", resid = (cl.lines || []).some(function (l) { return l.cpt === "H0018"; });
      var rnd = this._seed(claimId, "edi"), npi = function () { return "1" + String(100000000 + Math.floor(rnd() * 899999999)); };
      var pos = inst ? (resid ? "55" : "21") : ((cl.lines || []).some(function (l) { return l.cpt === "90935"; }) ? "65" : "11");
      var posLabel = { "11": "Office", "21": "Inpatient Hospital", "22": "Outpatient Hospital", "55": "Residential Facility", "65": "ESRD Facility", "12": "Home" }[pos] || pos;
      var rp = { "Dr. A. Morgan": 0, "Dr. L. Chen": 0, "Dr. R. Patel": 0, "Dr. S. Okafor": 0 };
      var refName = Object.keys(rp)[Math.floor(rnd() * 4)];
      return {
        transaction: { setId: "837", implementationGuide: inst ? "005010X223A2 (Institutional)" : "005010X222A1 (Professional)", purpose: "CH — Chargeable", controlNumber: "0" + (1001 + Math.floor(rnd() * 8999)) },
        submitter: { name: "VA Community Care Network", id: "VACCN01" },
        receiver: { name: "VHA Payment Integrity", id: "VHAPI" },
        billingProvider: { loop: "2010AA · NM1*85", npi: p.npi, name: p.name, taxIdType: "EI", taxId: p.tin, taxonomy: p.taxonomyCode || "—", address: (p.city || "") + ", " + (p.state || "") },
        renderingProvider: { loop: "2310B · NM1*82", npi: npi(), name: p.name },
        referringProvider: { loop: "2310A · NM1*DN", npi: npi(), name: refName },
        subscriber: { loop: "2010BA · NM1*IL", memberId: ve.memberId || "—", name: ve.name || "—", dob: ve.dob || "—", gender: ve.sex || "—", relationship: "18 — Self", responsibility: "P — Primary" },
        payer: { loop: "2010BB · NM1*PR", name: "VA CCN", id: "VACCN", claimControlNumber: "VACCN" + (1000000 + Math.floor(rnd() * 8999999)) },
        claim: {
          loop: "2300 · CLM", patientControlNumber: cl.claimNumber, totalClaimCharge: cl.billedAmount,
          placeOfService: pos + " — " + posLabel, facilityQualifier: inst ? "A — Institutional" : "B — Professional",
          frequencyCode: "1 — Original", providerSignature: "Y", assignmentOfBenefits: "Y", benefitAssignment: "Y", releaseOfInfo: "I — Informed consent",
          billType: inst ? (resid ? "86X — Special facility (residential)" : "111 — Hospital inpatient") : null,
          admissionType: inst ? "3 — Elective" : null,
          statementDates: inst ? (cl.dateOfService + " – " + cl.dateOfService) : null,
          diagnoses: (cl.diagnosisCodes || []).map(function (dx, i) { return { pointer: i + 1, qualifier: i === 0 ? "ABK — Principal (ICD-10-CM)" : "ABF — Other (ICD-10-CM)", code: dx }; })
        },
        serviceLines: (cl.lines || []).map(function (l, i) {
          return {
            lineNumber: i + 1, segment: inst ? "SV2 (2400)" : "SV1 (2400)",
            procedure: "HC:" + l.cpt + ((l.modifiers || []).length ? ":" + l.modifiers.join(":") : ""),
            revenueCode: inst ? (l.cpt === "H0018" ? "1002" : "0" + (250 + i * 50)) : null,
            chargeAmount: l.billed, unitBasis: "UN", units: l.units || 1,
            placeOfService: pos, diagnosisPointers: "1", serviceDate: "472 — " + cl.dateOfService,
            flagged: (l.violatesRuleIds || []).length > 0
          };
        })
      };
    },

    // CMS reference pricing (Zellis): submitted charge vs CMS-allowed per line + methodology.
    getCmsPricing: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      var p = providers[cl.providerId] || {}, inst = cl.type === "837I";
      var rnd = this._seed(claimId, "cms");
      var method = function (l) {
        if (inst) return l.cpt === "H0018" ? "Per-diem (residential)" : "OPPS / APC";
        if (/^7/.test(l.cpt)) return "MPFS — Radiology";
        if (/^9[0-3]/.test(l.cpt) && !/^99/.test(l.cpt)) return "MPFS — Medicine";
        if (/^99/.test(l.cpt)) return "MPFS — E/M";
        if (/^E/.test(l.cpt)) return "DMEPOS fee schedule";
        return "MPFS";
      };
      var lines = (cl.lines || []).map(function (l) {
        var flagged = (l.violatesRuleIds || []).length > 0;
        // CMS reference pricing: a flagged line prices LOWER than paid (correct code /
        // bundled / MUE-limited); clean lines price at the fee-schedule allowed.
        var cms = flagged ? Math.round(l.allowed * (0.4 + rnd() * 0.2) * 100) / 100 : l.allowed;
        var charge = Math.max(l.billed, Math.round(l.allowed * (1.7 + rnd() * 1.1)));
        return {
          cpt: l.cpt, description: l.description, modifiers: l.modifiers || [],
          submittedCharge: charge, cmsAllowed: cms, paid: l.paid,
          variance: Math.round((charge - cms) * 100) / 100, variancePct: cms ? Math.round(((charge - cms) / cms) * 100) : 0,
          overPaid: l.paid > cms + 0.5, methodology: method(l), flagged: flagged
        };
      });
      var sum = function (k) { return Math.round(lines.reduce(function (s, l) { return s + l[k]; }, 0) * 100) / 100; };
      return {
        source: "Zellis — CMS reference pricing", asOf: "2025 CMS fee schedules", locality: (p.state || "TX") + " · locality 05",
        lines: lines,
        totals: { submitted: sum("submittedCharge"), cmsAllowed: sum("cmsAllowed"), paid: sum("paid"), variance: Math.round((sum("submittedCharge") - sum("cmsAllowed")) * 100) / 100, overpayment: Math.round(Math.max(0, sum("paid") - sum("cmsAllowed")) * 100) / 100 },
        rulesApplied: ["MPFS locality adjustment (" + (p.state || "TX") + " 05)", inst ? "OPPS status-indicator pricing" : "RVU × conversion factor ($32.74)", "MPPR — multiple-procedure payment reduction", "NCCI PTP bundling edits", "Site-of-service differential"],
        ruleVersions: this.getPricingRuleVersions(claimId)
      };
    },
    // Version history for the pricing rules that priced the claim. Static / synthetic
    // (no data regen). A claim's date of service could fall under a prior version —
    // this surfaces what changed and when, so the reviewer can see the lineage of the
    // rates applied. Effective as of DOS is the one that priced the claim.
    getPricingRuleVersions: function (claimId) {
      var cl = claims[claimId]; if (!cl) return [];
      var p = providers[cl.providerId] || {}, st = p.state || "TX", inst = cl.type === "837I";
      return [
        {
          name: "MPFS conversion factor", authority: "CMS", current: { version: "CY2025", effective: "2025-01-01", value: "$32.74 / RVU" },
          note: "The dollar multiplier applied to each code's relative value units. Updated annually in the Medicare Physician Fee Schedule final rule.",
          history: [
            { version: "CY2024", effective: "2024-01-01", value: "$33.89 / RVU", change: "−3.4% CF reduction (CY2025 final rule)" },
            { version: "CY2023", effective: "2023-01-01", value: "$33.06 / RVU", change: "CF set by CY2024 final rule" }
          ]
        },
        {
          name: "GPCI locality adjustment", authority: "CMS", current: { version: "CY2025 GPCI", effective: "2025-01-01", value: st + " · locality 05" },
          note: "Geographic Practice Cost Index — adjusts the fee for local cost differences.",
          history: [
            { version: "CY2024 GPCI", effective: "2024-01-01", value: st + " · locality 05", change: "Work/PE/MP indices refreshed" },
            { version: "CY2023 GPCI", effective: "2023-01-01", value: st + " · locality 05", change: "Prior triennial GPCI update" }
          ]
        },
        {
          name: "MPPR — multiple-procedure payment reduction", authority: "CMS", current: { version: "v1.0", effective: "2024-07-01", value: "50% on 2nd+ procedure" },
          note: "Reduces payment for the second and subsequent procedures billed in the same session.",
          history: [
            { version: "v0.9", effective: "2023-01-01", value: "25% on 2nd+ procedure", change: "Reduction increased 25% → 50%" }
          ]
        },
        {
          name: inst ? "OPPS status-indicator pricing" : "RVU relative value file", authority: "CMS", current: { version: inst ? "CY2025 OPPS" : "CY2025 RVU", effective: "2025-01-01", value: inst ? "APC weights CY2025" : "RVUs CY2025" },
          note: inst ? "Outpatient Prospective Payment System — APC weights and status indicators." : "Work / practice-expense / malpractice RVUs per code.",
          history: [
            { version: inst ? "CY2024 OPPS" : "CY2024 RVU", effective: "2024-01-01", value: inst ? "APC weights CY2024" : "RVUs CY2024", change: "Annual valuation update" }
          ]
        },
        {
          name: "NCCI PTP edit set", authority: "CMS NCCI", current: { version: "v31.1", effective: "2025-01-01", value: "Q1 CY2025 edit file" },
          note: "Procedure-to-procedure bundling edits, refreshed quarterly.",
          history: [
            { version: "v30.3", effective: "2024-10-01", value: "Q4 CY2024 edit file", change: "212 pairs added, 47 removed" },
            { version: "v30.0", effective: "2024-01-01", value: "Q1 CY2024 edit file", change: "Annual baseline refresh" }
          ]
        },
        {
          name: "VA fee schedule / CMAC allowance", authority: "VA CCN", current: { version: "v3.1", effective: "2025-01-15", value: "CMAC table 2025" },
          note: "VA Community Care allowance table used where it governs over MPFS.",
          history: [
            { version: "v3.0", effective: "2024-07-01", value: "CMAC table 2024 H2", change: "Mid-year CMAC refresh" },
            { version: "v2.4", effective: "2024-01-01", value: "CMAC table 2024 H1", change: "Annual CMAC update" }
          ]
        }
      ];
    },

    // ---- provider contact (for records requests) ----
    // Deterministic, and impossible-to-be-real by construction: fax numbers sit in the
    // 555-01xx block reserved for fiction, and email uses the reserved example.com
    // domain. Derived here rather than generated so the dataset stays byte-stable.
    AREA_BY_STATE: { TX: "210", AZ: "602", CA: "619", NV: "702", NM: "505", OK: "405", LA: "504", AR: "501" },
    getProviderContact: function (pid) {
      var p = providers[pid]; if (!p) return null;
      var digits = String(pid).replace(/\D/g, "") || "0";
      var last2 = String(Number(digits) % 100).padStart(2, "0");
      var area = this.AREA_BY_STATE[p.state] || "210";
      var slug = String(p.name || "provider").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").split("-").slice(0, 3).join("-");
      return {
        fax: "+1 (" + area + ") 555-01" + last2,
        email: "records@" + slug + ".example.com",
        portal: "VA Provider Portal · " + (p.npi || pid),
        attention: "Health Information Management / Release of Information"
      };
    },

    // ---- facility capacity (beds vs patient-days billed) ----
    // Only meaningful for bedded facilities (residential / inpatient). The fraud
    // signal is billing more patient-days than the staffed bed count can physically
    // hold over a period — impossible days that no coding review would surface,
    // and a peak-concurrent census above the staffed beds. Derived (no data regen).
    getFacilityCapacity: function (id) {
      var p = providers[id]; if (!p) return null;
      var tax = p.taxonomyCode || "";
      var residential = /^3245/.test(tax);   // substance-abuse residential
      var hospital = /^282N/.test(tax);      // general hospital
      if (!residential && !hospital) return null;
      var seed = 0; for (var i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i) + 7) >>> 0;
      var rnd = function () { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
      var chain = p.role === "chain";
      var periodDays = 90;
      var licensedBeds = residential ? 36 + Math.floor(rnd() * 10) : 140 + Math.floor(rnd() * 60);
      var staffedBeds = Math.round(licensedBeds * (residential ? 0.72 : 0.86));
      var capacityDays = staffedBeds * periodDays;
      // a chain residential facility bills beyond what its beds can hold; others sit within
      var util = chain ? 1.10 + rnd() * 0.09 : 0.58 + rnd() * 0.22;
      var patientDaysBilled = Math.round(capacityDays * util);
      var peakConcurrent = chain ? staffedBeds + 4 + Math.floor(rnd() * 5) : Math.round(staffedBeds * (0.68 + rnd() * 0.18));
      return {
        periodLabel: "trailing 90 days", periodDays: periodDays,
        licensedBeds: licensedBeds, staffedBeds: staffedBeds,
        capacityDays: capacityDays, patientDaysBilled: patientDaysBilled,
        utilization: Math.round(util * 100),
        overCapacity: patientDaysBilled > capacityDays,
        excessDays: Math.max(0, patientDaysBilled - capacityDays),
        peakConcurrent: peakConcurrent, peakOverStaffed: peakConcurrent > staffedBeds,
        peakExcess: Math.max(0, peakConcurrent - staffedBeds)
      };
    },

    // ---- CPT crosswalk: is THIS code payable billed with THIS modifier? ----
    // Three reference checks per claim line, the way a coder reads a claim:
    //   PTP  — NCCI procedure-to-procedure edits. A column-2 code billed with its
    //          column-1 code on the same day is bundled and not separately payable.
    //          Modifier indicator 1 means a 59/X{EPSU} modifier may override it *if*
    //          a distinct service is documented; 0 means no override is permitted.
    //   MUE  — medically unlikely edits: the max units of a code per day.
    //   MOD  — is each modifier even valid on this code?
    // Reference tables are static (no RNG) so the hero scenarios stay byte-stable.
    CPT_XWALK: {
      // column-1 code : { column-2 codes bundled into it : NCCI modifier indicator }
      ptp: {
        "43239": { "43235": 1 },              // EGD w/ biopsy includes the diagnostic EGD
        "20610": { "99213": 1, "99214": 1 },  // E/M bundled into the injection unless separately identifiable
        "90935": { "99213": 1 },
        "97110": { "97140": 1 },
        "99283": { "93000": 0 }               // indicator 0 — no override permitted
      },
      // max units per code per day
      mue: { "99211": 1, "99212": 1, "99213": 1, "99214": 1, "99215": 1, "43239": 1, "43235": 1, "90935": 1, "93000": 1, "71046": 2, "97110": 4, "70551": 1, "20610": 2, "99283": 1, "E1390": 1, "D0120": 1, "D1110": 1, "H0018": 30 },
      mod: {
        "25": { name: "Significant, separately identifiable E/M service", appliesTo: "em", note: "Valid only on an E/M code billed alongside a procedure the same day." },
        "59": { name: "Distinct procedural service", appliesTo: "proc", note: "Valid only on a procedure code, and only to override an NCCI PTP edit when a distinct session/site is documented." },
        "XU": { name: "Unusual non-overlapping service", appliesTo: "proc", note: "NCCI-specific subset of modifier 59." },
        "XS": { name: "Separate structure", appliesTo: "proc", note: "NCCI-specific subset of modifier 59." },
        "26": { name: "Professional component", appliesTo: "pctc", note: "Valid only on codes with a professional/technical split." },
        "TC": { name: "Technical component", appliesTo: "pctc", note: "Valid only on codes with a professional/technical split." },
        "50": { name: "Bilateral procedure", appliesTo: "bilat", note: "Valid only on bilateral-eligible procedures." },
        "76": { name: "Repeat procedure by the same physician", appliesTo: "proc", note: "Valid on a repeated procedure the same day." },
        "91": { name: "Repeat clinical diagnostic laboratory test", appliesTo: "lab", note: "Valid only on clinical lab codes." }
      },
      pctc: ["70551", "71046", "93000"],
      bilat: ["20610", "71046"]
    },
    getCptCrosswalk: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      var X = this.CPT_XWALK, lines = cl.lines || [];
      var isEm = function (c) { return /^99/.test(c); };
      var codes = lines.map(function (l) { return l.cpt; });
      var overrideMods = ["59", "XU", "XS", "XE", "XP"];

      var rows = lines.map(function (l) {
        var mods = l.modifiers || [], checks = [], verdict = "pass";
        var worse = function (v) { var rank = { pass: 0, review: 1, fail: 2 }; if (rank[v] > rank[verdict]) verdict = v; };

        // --- PTP: is this line a column-2 code of another line on the same claim?
        var ptp = null;
        Object.keys(X.ptp).forEach(function (c1) {
          if (codes.indexOf(c1) < 0 || c1 === l.cpt) return;
          var ind = X.ptp[c1][l.cpt];
          if (ind === undefined) return;
          var ovr = mods.filter(function (m) { return overrideMods.indexOf(m) >= 0; });
          ptp = { column1: c1, column2: l.cpt, indicator: ind, overrides: ovr };
          if (ind === 0) {
            ptp.status = "fail";
            ptp.note = "Bundled into " + c1 + ". Modifier indicator 0 — no modifier may override this edit; the code is not separately payable.";
            worse("fail");
          } else if (!ovr.length) {
            ptp.status = "fail";
            ptp.note = "Bundled into " + c1 + " and billed without an override modifier — not separately payable in the same session.";
            worse("fail");
          } else {
            ptp.status = "review";
            ptp.note = "Bundled into " + c1 + ", overridden with modifier " + ovr.join("/") + ". Payable only if the record documents a distinct procedural service — verify before paying.";
            worse("review");
          }
        });

        // --- MUE
        var limit = X.mue[l.cpt], mue = null;
        if (limit !== undefined) {
          mue = { limit: limit, billed: l.units, exceeded: l.units > limit };
          if (mue.exceeded) { worse("fail"); mue.note = "Billed " + l.units + " units against an MUE of " + limit + " per day."; }
        }

        // --- modifier validity
        mods.forEach(function (m) {
          var def = X.mod[m];
          if (!def) { checks.push({ mod: m, name: "Unrecognized modifier", valid: false, note: "Not a recognized modifier for this code set." }); worse("fail"); return; }
          var ok = true, note = def.note;
          if (def.appliesTo === "em") ok = isEm(l.cpt);
          else if (def.appliesTo === "proc") ok = !isEm(l.cpt);
          else if (def.appliesTo === "pctc") ok = X.pctc.indexOf(l.cpt) >= 0;
          else if (def.appliesTo === "bilat") ok = X.bilat.indexOf(l.cpt) >= 0;
          else if (def.appliesTo === "lab") ok = false;
          if (!ok) { note = "Modifier " + m + " is not valid on " + l.cpt + ". " + def.note; worse("fail"); }
          // a 59-family modifier with no PTP edit to override is an unsupported override
          else if (overrideMods.indexOf(m) >= 0 && !ptp) {
            ok = false; worse("review");
            note = "Modifier " + m + " applied but no NCCI PTP edit exists for " + l.cpt + " on this claim — the override is unnecessary and may mask an unbundling pattern.";
          }
          checks.push({ mod: m, name: def.name, valid: ok, note: note });
        });

        return {
          cpt: l.cpt, description: l.description, modifiers: mods, units: l.units,
          ptp: ptp, mue: mue, modChecks: checks, verdict: verdict,
          flagged: (l.violatesRuleIds || []).length > 0
        };
      });

      var fails = rows.filter(function (r) { return r.verdict === "fail"; }).length;
      var reviews = rows.filter(function (r) { return r.verdict === "review"; }).length;
      return {
        source: "CMS NCCI edits + AMA CPT reference", asOf: "NCCI v31.1 · effective 2025-01-01",
        lines: rows, fails: fails, reviews: reviews,
        clean: rows.length - fails - reviews,
        determination: fails ? "Coding edits failed — one or more lines are not separately payable as billed"
          : reviews ? "Overrides present — payable only if the record documents a distinct service"
            : "All lines pass NCCI PTP, MUE and modifier validity checks",
        editsApplied: ["NCCI procedure-to-procedure (PTP) edits", "Medically unlikely edits (MUE) — units per day", "Modifier-to-code validity", "Modifier 59 / X{EPSU} override review"]
      };
    },

    // Utilization management (Milliman MCG): clinical criteria, level of care, LOS.
    getUtilizationMgmt: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      var resid = (cl.lines || []).some(function (l) { return l.cpt === "H0018"; });
      var dialysis = (cl.lines || []).some(function (l) { return l.cpt === "90935"; });
      var em = (cl.lines || []).some(function (l) { return /^99/.test(l.cpt); });
      var rnd = this._seed(claimId, "um"), base = { source: "Milliman MCG Care Guidelines", edition: "28th Edition (2025)" };
      if (resid) {
        return Object.assign(base, {
          guideline: { code: "BHG-RES", title: "Residential Behavioral Health Treatment" },
          levelOfCare: { recommended: "Intensive Outpatient / Partial Hospitalization", billed: "Residential — 24-hour" },
          lengthOfStay: { recommendedDays: 14, actualDays: 27 + Math.floor(rnd() * 4), unit: "days" },
          priorAuth: { required: true, number: "UM-" + (100000 + Math.floor(rnd() * 899999)), status: "Approved — 14 days" },
          criteria: [
            { label: "24-hour supervision medically necessary", met: false, note: "Documentation does not support 24-hour level of care beyond day 14." },
            { label: "Active treatment plan with measurable goals", met: true },
            { label: "Failed a lower level of care", met: true },
            { label: "Continued-stay criteria met (day 15+)", met: false, note: "Patient stable, no worsening — step-down indicated." }
          ],
          determination: "Does not meet continued-stay criteria beyond the authorized 14 days"
        });
      }
      if (dialysis) {
        return Object.assign(base, {
          guideline: { code: "ORG-DIAL", title: "Hemodialysis — Chronic (ESRD)" },
          levelOfCare: { recommended: "Outpatient dialysis 3×/week", billed: "Outpatient dialysis" },
          priorAuth: { required: false, number: null, status: "Standing ESRD order on file" },
          criteria: [
            { label: "ESRD diagnosis documented (N18.6)", met: true },
            { label: "Frequency ≤ 3 sessions / week", met: true, note: "Standing M/W/F regimen consistent with guideline." },
            { label: "Vascular access functioning", met: true }
          ],
          determination: "Meets criteria — frequency consistent with ESRD standing order"
        });
      }
      return Object.assign(base, {
        guideline: { code: "AMB-EM", title: "Ambulatory Evaluation & Management" },
        levelOfCare: { recommended: "Outpatient office visit", billed: "Outpatient office visit" },
        priorAuth: { required: false, number: null, status: "Not required for this service" },
        criteria: [
          { label: "Service medically necessary for documented condition", met: true },
          { label: "Level of service supported by documentation", met: !em, note: em ? "MCG complexity mapping supports a lower E/M level than billed." : undefined },
          { label: "Frequency within expected range", met: true }
        ],
        determination: em ? "Review — documented complexity maps to a lower E/M level" : "Meets criteria"
      });
    }
  };
})();
