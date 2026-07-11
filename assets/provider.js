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
        rulesApplied: ["MPFS locality adjustment (" + (p.state || "TX") + " 05)", inst ? "OPPS status-indicator pricing" : "RVU × conversion factor ($32.74)", "MPPR — multiple-procedure payment reduction", "NCCI PTP bundling edits", "Site-of-service differential"]
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
