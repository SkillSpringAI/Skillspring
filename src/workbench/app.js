"use strict";
const $ = id => document.getElementById(id);
let state;
const labels = { reviewer: "Domain reviewer", officer: "Governance officer", maintainer: "Engineering maintainer" };
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function latest(who) { return state.history.filter(item => item.record.reviewer === who).at(-1); }
function qualified(record) {
  const a = record?.candidateAssessment;
  return record?.decision === "APPROVE" && a?.coverage === "COMPLETE" &&
    a.claim_checks.length === state.package.claims.length && a.claim_checks.every(c => c.finding === "SUPPORTED") &&
    a.authority_claims === "CLEARED" && a.output_admissibility === "PASS";
}
function busy(value) {
  $("mode").disabled = value;
  $("refresh").disabled = value;
  $("review-fields").disabled = value;
}
function message(text, error = false) {
  $("message").textContent = text;
  $("message").className = error ? "error" : "";
}
function select(label, id, options) {
  const wrapper = node("label", label), input = node("select"); input.id = id;
  for (const [value, text] of options) { const option = node("option", text); option.value = value; input.append(option); }
  wrapper.append(input); return wrapper;
}
function metadata(container, title, text) { container.append(node("dt", title), node("dd", text)); }
function dispositionHelp() {
  $("disposition-help").textContent = $("decision").value === "REJECT"
    ? "Rejection permanently blocks this draft and audience for this session, even if a later assessment is positive."
    : "All claims must be supported and both checks must pass to qualify as a positive review.";
}
function loadReviewer() {
  const saved = latest($("reviewer").value)?.record;
  const assessment = saved?.candidateAssessment;
  state.package.claims.forEach((claim, index) => {
    $("finding-" + index).value = assessment?.claim_checks.find(check => check.claim_id === claim.id)?.finding ?? "UNCERTAIN";
  });
  $("authority").value = assessment?.authority_claims ?? "UNCERTAIN";
  $("output").value = assessment?.output_admissibility ?? "UNCERTAIN";
  $("decision").value = saved?.decision ?? "APPROVE";
  dispositionHelp();
}
function render(next) {
  const previousMode = state?.mode, previousReviewer = $("reviewer").value;
  state = next;
  $("workspace").hidden = false;
  const blocked = state.result.reason === "REVIEW_REJECTED";
  $("status").textContent = blocked ? "Review blocked" : state.result.review_complete ? "Review complete · simulation only" : "Review pending";
  $("status").closest("section").className = "status-bar" + (blocked ? " blocked" : state.result.review_complete ? " complete" : "");
  $("reason").textContent = blocked ? "A stored rejection prevents completion. Later positive findings cannot clear it."
    : state.result.review_complete ? "Every required test reviewer has a qualifying assessment. The answer remains an unreleased draft."
    : "Each required test reviewer must support every claim and clear both checks.";
  $("reason-code").textContent = state.result.reason;
  $("answer").textContent = state.package.candidate.answer.text;
  $("claims").replaceChildren(); $("findings").replaceChildren();
  const answer = Array.from(state.package.candidate.answer.text);
  state.package.claims.forEach((claim, index) => {
    const section = node("article", undefined, "claim");
    section.append(node("div", `Claim ${index + 1} · code points ${claim.start}–${claim.end}`, "claim-title"),
      node("h3", answer.slice(claim.start, claim.end).join("")));
    claim.support.forEach(support => {
      const source = state.package.sources.find(item => item.source_id === support.source_id);
      section.append(node("blockquote", Array.from(source.text).slice(support.start, support.end).join("")),
        node("p", `${source.source_id} · ${source.origin} · code points ${support.start}–${support.end}`, "hint"));
    });
    $("claims").append(section);
    $("findings").append(select(`Claim ${index + 1} finding`, "finding-" + index,
      [["UNCERTAIN", "Uncertain / not checked"], ["SUPPORTED", "Supported by source"], ["UNSUPPORTED", "Not supported"]]));
  });
  $("sources").replaceChildren();
  for (const source of state.package.sources) {
    const details = node("dl");
    metadata(details, source.source_id, source.text);
    metadata(details, "Source hash", source.content_sha256);
    metadata(details, "Captured", source.captured_at);
    metadata(details, "Resource", source.resource);
    $("sources").append(details);
  }
  $("provenance").replaceChildren();
  const p = state.package.candidate.provenance;
  metadata($("provenance"), "Subject binding", state.subject_hash);
  metadata($("provenance"), "Answer hash", p.answer_sha256);
  metadata($("provenance"), "Governance manifest", state.package.candidate.governance_manifest_id);
  metadata($("provenance"), "Scope", `${state.scope.organization} / ${state.scope.domain} / ${state.scope.environment}; audience: ${state.scope.audience.join(", ")}`);
  metadata($("provenance"), "Fixture provenance", `${p.request_id} / ${p.inference_profile_id}; no provider was called`);
  $("requirements").textContent = `${state.required_reviewers.length} distinct test reviewer${state.required_reviewers.length === 1 ? "" : "s"} required for ${state.mode.toLowerCase()} mode.`;
  $("reviewers").replaceChildren(); $("reviewer").replaceChildren();
  state.required_reviewers.forEach(who => {
    const saved = latest(who);
    const disposition = !saved ? "Awaiting assessment" : saved.record.decision === "REJECT" ? "Rejected"
      : qualified(saved.record) ? "Qualifying findings" : "Uncertain or incomplete findings";
    $("reviewers").append(node("li", `${labels[who]} — ${disposition}`));
    const option = node("option", labels[who]); option.value = who; $("reviewer").append(option);
  });
  if (previousMode === state.mode && state.required_reviewers.includes(previousReviewer)) $("reviewer").value = previousReviewer;
  loadReviewer();
  $("history").replaceChildren();
  if (!state.history.length) $("history").append(node("li", "No assessments recorded yet."));
  state.history.forEach(item => {
    const record = item.record, a = record.candidateAssessment;
    const li = node("li");
    li.append(node("strong", `${labels[record.reviewer]} · revision ${item.revision} · ${record.decision === "REJECT" ? "Rejected" : "Findings recorded"}`));
    li.append(node("div", a.claim_checks.map(c => `${c.claim_id}: ${c.finding.toLowerCase()}`).join("; ") +
      `; authority: ${a.authority_claims.toLowerCase()}; output: ${a.output_admissibility.toLowerCase()}.`));
    $("history").append(li);
  });
  $("session-info").textContent = `Fixed simulation clock: ${state.clock}. Refresh preserves session history. Restarting the server begins a new synthetic session.`;
}
async function readResponse(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.code ?? "REQUEST_FAILED");
  return body;
}
async function load() {
  busy(true); $("retry").hidden = true; message("Loading saved review…");
  try {
    render(await readResponse(await fetch(`/api/workbench?mode=${encodeURIComponent($("mode").value)}`, { cache: "no-store" })));
    message("Saved review loaded."); busy(false);
  } catch (error) {
    message(`Could not load the review: ${error.message}. Check that the local server is running, then refresh.`, true);
    $("workspace").hidden = !state;
    $("retry").hidden = false;
    $("mode").disabled = false; $("refresh").disabled = false;
  }
}
$("mode").addEventListener("change", load);
$("refresh").addEventListener("click", load);
$("retry").addEventListener("click", load);
$("reviewer").addEventListener("change", loadReviewer);
$("decision").addEventListener("change", dispositionHelp);
$("assessment").addEventListener("submit", async event => {
  event.preventDefault();
  const reviewer = $("reviewer").value;
  const submission = {
    mode: state.mode, reviewer, subject_hash: state.subject_hash,
    expected_revision: latest(reviewer)?.revision ?? 0,
    decision: $("decision").value,
    claim_checks: state.package.claims.map((claim, index) => ({ claim_id: claim.id, finding: $("finding-" + index).value })),
    authority_claims: $("authority").value, output_admissibility: $("output").value
  };
  busy(true); message("Recording signed test assessment…");
  try {
    render(await readResponse(await fetch("/api/reviews", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Workbench-Token": state.csrf_token }, body: JSON.stringify(submission)
    })));
    message("Assessment recorded. Review status has been rechecked.");
  } catch (error) {
    message(`Assessment could not be confirmed: ${error.message}. Refresh saved review before trying again.`, true);
    // A response may be lost after commit. Require refresh before another write.
    $("mode").disabled = false; $("refresh").disabled = false;
    return;
  }
  busy(false);
});
load();
