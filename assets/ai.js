/* Deterministic "Gen AI" — the AIProvider seam. Pre-scripted, streamed to feel live.
   Backlog: swap for a live Gemini call via a serverless proxy (no UI change).
   Attaches to window.AI. */
(function () {
  function draftRationale(a, outcome) {
    var p = a.provider || {}, exp = window.DP.usd(a.exposurePost || 0);
    var C = {
      confirm: "Confirmed " + a.fwaType.toLowerCase() + ". " + p.name + " (NPI " + (p.npi || "—") +
        ") shows the flagged pattern with supporting rule and peer evidence; documentation does not justify the billed services. " +
        "Recommend recovery of " + exp + " in improper post-payment amounts and update of the provider risk profile.",
      dismiss: "Reviewed and dismissed. On examination of the record, the flagged pattern is clinically and contractually supported; no improper payment is identified. " +
        "Logging as a false positive so the outcome feeds model retraining and reduces similar low-confidence flags.",
      escalate: "Escalating to a Case. The pattern combined with network signals (shared identifiers / referrals) suggests coordinated behavior warranting a provider-level case beyond single-claim recovery."
    };
    // scenario-specific overrides
    if (a.id === "20517") {
      C.confirm = "Confirmed unbundling. Rio Grande Surgical Partners (NPI 1487653920) billed 43235 with modifier 59 alongside 43239 on 28 of 31 paired claims, bypassing the NCCI PTP edit with no documentation of a distinct procedural service. Component 43235 ($410/claim) is not separately payable in the same session. Recommend recovery of $11,480.";
      C.escalate = "Escalating to a Case. The 90% modifier-59 override rate combined with a shared billing TIN (00-6820473) with Alamo Internal Medicine (PR001) suggests coordinated behavior warranting a provider-level case.";
    }
    if (a.id === "20463") {
      C.dismiss = "Reviewed and dismissed. The medical record confirms end-stage renal disease (N18.6) with a standing order for thrice-weekly in-center hemodialysis — 36 sessions/quarter is clinically appropriate. No improper payment. Logged as a false positive to condition-adjust the frequency model for ESRD.";
    }
    if (a.id === "20481") {
      C.confirm = "Confirmed upcoding. Alamo Internal Medicine bills 99215 on ~90% of established-patient visits vs a 14% specialty-peer median (5.8σ), with linked diagnoses showing low clinical complexity. Recommend recovery of the overpayment differential (~$22,815) and a targeted claim review.";
    }
    return C[outcome] || "";
  }

  // Structured "Summarize this case for adjudication" brief: talks through the
  // anomaly, the evidence, the network signal, precedent, and a recommended action.
  function adjudicationSummary(a) {
    var p = a.provider || {}, exp = window.DP.usd((a.mode === "prepay" ? a.exposurePre : a.exposurePost) || 0);

    // 1) anomaly
    var anomaly = (a.xai && a.xai.summary) || (p.name + " was flagged for " + a.fwaType.toLowerCase() + " at risk " + a.riskScore + "/100.");

    // 2) evidence — rules fired, model, and the strongest XAI factors
    var evidence = [];
    (a.rules || []).forEach(function (r) { evidence.push({ label: "Rule fired", detail: r.name + " (" + r.code + ")" }); });
    if (a.model) evidence.push({ label: "ML/AI model", detail: a.model.name + " · " + a.model.type });
    (a.xai && a.xai.factors || []).slice(0, 4).forEach(function (f) {
      evidence.push({ label: f.label, detail: f.value + (f.benchmark ? " (vs " + f.benchmark + ")" : ""), outlier: /σ|vs|threshold|separate|97th|100%|71%/.test((f.value || "") + (f.benchmark || "")) });
    });

    // 3) network signal
    var net = window.Collusion ? window.Collusion.analyze(p.id) : null;
    var network;
    if (net && net.isRing) {
      network = net.kind === "chain"
        ? "Not a one-off. This provider is one of " + net.providerCount + " facilities under " + (net.registration || "a single holding company") + " (officer " + (net.officer || "—") + ") cycling " + net.sharedPct + "% of the same veterans across " + net.states.join("/") + " under separate TINs — a coordinated residential-stay scheme."
        : "Not a one-off. " + net.providerCount + " flagged providers act as one billing entity" + (net.sharedTin ? " (shared TIN " + (net.tin || "") + ")" : "") + ", sharing " + net.sharedPct + "% of veterans" + (net.referralCount ? " and " + net.referralCount + " referrals" : "") + " — coordinated behavior beyond a single claim.";
    } else {
      network = "No collusion network — this provider bills in isolation, so the case rests on the claim's own evidence.";
    }

    // 4) precedent
    var sims = window.DP.getSimilarAdjudicated(a.fwaType) || [];
    var confirmed = sims.filter(function (s) { return s.outcome === "Confirmed"; });
    var recovered = confirmed.reduce(function (s, x) { return s + (x.recovered || 0); }, 0);
    var precedents = {
      total: sims.length, confirmed: confirmed.length, recovered: recovered,
      cases: sims.slice(0, 2),
      text: sims.length
        ? confirmed.length + " of " + sims.length + " prior " + a.fwaType.toLowerCase() + " cases were confirmed" + (recovered ? ", recovering " + window.DP.usd(recovered) : "") + "."
        : "No prior adjudicated cases of this type — treat as a precedent-setter."
    };

    // 5) recommendation — scenario overrides, else a rule over risk/confidence/network
    var rec;
    var isRing = net && net.isRing;
    if (a.mode === "prepay") {
      var pa = a.recommendedAction || "hold";
      var plabel = { pay: "Pay", hold: "Hold for records", deny: "Deny" }[pa];
      var prat = {
        pay: "Low risk and the amount matches the fee schedule — release " + window.DP.usd(a.exposurePre || 0) + " for payment.",
        hold: "Confidence is " + a.confidence + "% — hold the claim and pull the supporting records before " + window.DP.usd(a.exposurePre || 0) + " is paid.",
        deny: "The anomaly is corroborated" + (isRing ? " and the provider sits in a collusion network" : "") + " — deny to stop the " + window.DP.usd(a.exposurePre || 0) + " payment before it leaves."
      }[pa];
      rec = { action: pa, label: plabel, rationale: prat };
    }
    else if (a.id === "20463") rec = { action: "request-records", label: "Request records first", rationale: "Confidence is only " + a.confidence + "% and frequency alone drives the flag. If the medical record shows an ESRD dialysis regimen, dismiss as a false positive — recovering here would be an error." };
    else if (a.id === "20517") rec = { action: "confirm-escalate", label: "Confirm & escalate", rationale: "Two rules fired and the shared-TIN link to a partner provider lifts this above single-claim recovery. Confirm the " + exp + " and escalate the ring to a Case." };
    else if (a.id === "20544") rec = { action: "confirm-escalate", label: "Confirm & escalate", rationale: "The length-of-stay abuse is corroborated by rule + model, and the 4-facility holding-company chain makes this coordinated. Confirm " + exp + " and escalate the chain to a Case." };
    else if (a.id === "20481") rec = { action: "confirm", label: "Confirm", rationale: "Upcoding is 5.8σ above the specialty-peer median with low documented complexity. Confirm and recover the overpayment differential." };
    else if (isRing && a.riskScore >= 75) rec = { action: "confirm-escalate", label: "Confirm & escalate", rationale: "High risk plus a collusion network means this shouldn't be closed as one claim — confirm " + exp + " and escalate the network to a Case." };
    else if (a.confidence < 65) rec = { action: "request-records", label: "Request records first", rationale: "Confidence is " + a.confidence + "% — pull the supporting record before deciding; dismiss if the billing is clinically justified." };
    else if (a.riskScore >= 80) rec = { action: "confirm", label: "Confirm", rationale: "Risk " + a.riskScore + "/100 with " + a.confidence + "% confidence and corroborating rule/peer evidence. Confirm and recover " + exp + "." };
    else rec = { action: "confirm", label: "Confirm if evidence holds", rationale: "Moderate risk (" + a.riskScore + "/100). Confirm if the rule and peer evidence stand on record review; otherwise dismiss." };

    return { headline: "Adjudication brief · #" + a.id + " — " + a.fwaType, provider: p.name, exposure: exp, anomaly: anomaly, evidence: evidence, network: network, isRing: !!isRing, precedents: precedents, recommendation: rec };
  }

  // Simple intent-matched copilot answers grounded in the allegation/provider.
  function copilot(a, question) {
    var q = (question || "").toLowerCase();
    var p = a.provider || {};
    var band = window.DP.band(a.riskScore);
    var lvl = band === "high" ? "high" : band === "med" ? "moderate" : "low";
    if (q.indexOf("peer") >= 0 || q.indexOf("compare") >= 0) {
      if (a.id === "20481") return "Alamo Internal Medicine bills 99215 on ~90% of established-patient visits. The Internal-Medicine peer median is 14% (range 9–18% across 6 TX peers). That places this provider ~5.8σ above the peer group — the single strongest driver of the risk score.";
      return p.name + " scores " + a.riskScore + "/100 (" + lvl + ") for " + a.fwaType.toLowerCase() + ", above the peer norm for its specialty. See the Network view for shared-identifier context.";
    }
    if (q.indexOf("recommend") >= 0 || q.indexOf("action") >= 0 || q.indexOf("should") >= 0) {
      if (a.id === "20463") return "Recommendation: request the medical record first. The confidence is low (61%) and frequency alone drives the flag. If the record shows an ESRD dialysis regimen, dismiss as a false positive — recovering here would be an error.";
      if (a.id === "20517") return "Recommendation: confirm and escalate. Two rules fired (NCCI PTP + modifier-59) and the shared-TIN link to PR001 raises this above a single-claim recovery — a provider-level Case is warranted.";
      return "Recommendation: given a " + lvl + " risk score of " + a.riskScore + " with " + a.confidence + "% confidence, confirm if the rule/peer evidence holds, and escalate if network signals suggest coordination.";
    }
    if (q.indexOf("why") >= 0 || q.indexOf("flag") >= 0 || q.indexOf("explain") >= 0) {
      return a.xai ? a.xai.summary : "This item was flagged as " + a.fwaType.toLowerCase() + " with a risk of " + a.riskScore + "/100.";
    }
    if (q.indexOf("draft") >= 0 || q.indexOf("rationale") >= 0) {
      return draftRationale(a, "confirm");
    }
    if (q.indexOf("exposure") >= 0 || q.indexOf("recover") >= 0 || q.indexOf("amount") >= 0 || q.indexOf("dollar") >= 0) {
      return "Estimated post-payment exposure is " + window.DP.usd(a.exposurePost || 0) + ". If confirmed, that amount moves to Submitted for recovery.";
    }
    return "This is a " + a.fwaType.toLowerCase() + " lead on " + p.name + " with risk " + a.riskScore + "/100 and " + a.confidence + "% confidence. Ask me to summarize the risk, compare to peers, recommend an action, or draft a rationale.";
  }

  // Typewriter streamer for the "live" feel.
  function stream(el, text, done) {
    el.textContent = "";
    var i = 0;
    var iv = setInterval(function () {
      i += 3; el.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(iv); el.textContent = text; if (done) done(); }
    }, 12);
    return iv;
  }

  window.AI = { draftRationale: draftRationale, adjudicationSummary: adjudicationSummary, copilot: copilot, stream: stream };
})();
