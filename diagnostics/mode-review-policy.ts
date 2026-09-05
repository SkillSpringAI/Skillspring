import assert from "node:assert/strict";
import { draftPolicy } from "../scripts/review-policy/policy.js";
import { simulateAccess, simulateReleaseReview, reviewSubjectHash, type PolicyContext, type ReviewSubject, type ReviewRecord } from "../scripts/review-policy/simulate.js";

export function checkModeReviewPolicy() {
  const context: PolicyContext = {
    now: 100,
    principals: [
      { id: "alice", roles: ["user"], domains: ["engineering"] },
      { id: "admin", roles: ["access_administrator"], domains: ["engineering"] },
      { id: "reviewer", roles: ["domain_reviewer"], domains: ["engineering"] },
      { id: "officer", roles: ["governance_officer"], domains: ["engineering"] },
      { id: "maintainer", roles: ["engineering_maintainer"], domains: ["engineering"] }
    ],
    resources: [
      { id: "public/guide", domain: "engineering", classification: "public" },
      { id: "domain/audit", domain: "engineering", classification: "domain_restricted" },
      { id: "sandbox/tests", domain: "engineering", classification: "engineering_sandbox" },
      { id: "protected/constitution", domain: "engineering", classification: "protected" }
    ],
    issuerMandates: [{ issuer: "admin", domains: ["engineering"],
      roles: ["user", "domain_reviewer", "governance_officer", "engineering_maintainer"], modes: ["DEFAULT", "GOVERNANCE", "ARCHITECT"] }],
    clearances: []
  };
  for (const principal of context.principals.filter(p => p.id !== "admin")) {
    context.clearances.push({
      id: `grant-${principal.id}`, subject: principal.id, issuer: "admin", role: principal.roles[0], domain: "engineering",
      modes: ["DEFAULT", "GOVERNANCE", "ARCHITECT"], resources: context.resources.map(r => r.id),
      operations: ["read", "request_review", "test", "debug", "propose_change", "review_evidence", "review_release"],
      issuedAt: 0, expiresAt: 200, revoked: false
    });
  }
  const base = { actor: "alice", mode: "DEFAULT" as const, domain: "engineering", resource: "public/guide", operation: "read" as const };
  assert.equal(simulateAccess(base, context).would_permit, true);
  assert.equal(simulateAccess(base, { ...context, clearances: [] }).would_permit, false);
  for (const resource of ["domain/audit", "sandbox/tests", "protected/constitution", "public/../domain/audit", "public/guide-extra"]) {
    assert.equal(simulateAccess({ ...base, resource }, context).would_permit, false);
  }
  assert.equal(simulateAccess({ ...base, mode: "GOVERNANCE", resource: "domain/audit" }, context).reason, "ROLE_DENIED");
  const gov = { ...base, actor: "officer", mode: "GOVERNANCE" as const, resource: "domain/audit" };
  assert.equal(simulateAccess(gov, context).would_permit, true);
  assert.equal(simulateAccess(gov, { ...context, clearances: [] }).reason, "CLEARANCE_REQUIRED");
  assert.equal(simulateAccess({ ...gov, domain: "health" }, context).would_permit, false);
  const arch = { ...base, actor: "maintainer", mode: "ARCHITECT" as const, resource: "sandbox/tests", operation: "debug" as const };
  assert.equal(simulateAccess(arch, context).would_permit, true);
  assert.equal(simulateAccess({ ...arch, resource: "domain/audit" }, context).would_permit, false);
  assert.equal(simulateAccess({ ...arch, resource: "protected/constitution" }, context).would_permit, false);
  for (const alter of [
    (c: PolicyContext) => { c.clearances[2].revoked = true; },
    (c: PolicyContext) => { c.clearances[2].expiresAt = 100; },
    (c: PolicyContext) => { c.clearances[2].issuedAt = 101; },
    (c: PolicyContext) => { c.clearances[2].issuer = "officer"; },
    (c: PolicyContext) => { c.issuerMandates = []; },
    (c: PolicyContext) => { c.issuerMandates[0].domains = ["health"]; }
  ]) {
    const copy = structuredClone(context); alter(copy);
    assert.equal(simulateAccess(gov, copy).would_permit, false);
  }
  const subject: ReviewSubject = {
    candidate: { answer: "draft", manifest: "test-manifest", evidence: ["source-1"] },
    accessMode: "GOVERNANCE", domain: "engineering", resource: "domain/audit", audience: ["alice"],
    requester: "alice", producer: "model", policyVersion: draftPolicy.version
  };
  const records: ReviewRecord[] = ["reviewer", "officer"].map((reviewer, index) => ({
    id: `review-${index}`, reviewer, role: index ? "governance_officer" : "domain_reviewer",
    subjectHash: reviewSubjectHash(subject), decision: "APPROVE", evidence: "VERIFIED", authorityClaims: "CLEARED",
    outputChecks: "PASS", reviewedAt: 50, expiresAt: 200, revoked: false
  }));
  const valid = simulateReleaseReview(subject, records, context);
  assert.equal(valid.review_complete, true);
  assert.equal(valid.release_authorized, false);
  for (const mode of ["DEFAULT", "ARCHITECT"] as const) {
    const variant = { ...subject, accessMode: mode,
      resource: mode === "DEFAULT" ? "public/guide" : "sandbox/tests" };
    const reviewers = mode === "DEFAULT" ? ["reviewer"] : ["maintainer", "officer"];
    const selected: ReviewRecord[] = reviewers.map((reviewer, index) => ({
      ...records[0], id: `variant-${index}`, reviewer,
      role: mode === "DEFAULT" ? "domain_reviewer" : index === 0 ? "engineering_maintainer" : "governance_officer",
      subjectHash: reviewSubjectHash(variant)
    }));
    assert.equal(simulateReleaseReview(variant, selected, context).review_complete, true);
    assert.equal(simulateReleaseReview(variant, [], context).review_complete, false);
    const selfReview = { ...variant, requester: reviewers[0] };
    const selfRecords = selected.map(record => ({ ...record, subjectHash: reviewSubjectHash(selfReview) }));
    assert.equal(simulateReleaseReview(selfReview, selfRecords, context).review_complete, false);
  }
  assert.equal(simulateReleaseReview(subject, records.slice(0, 1), context).review_complete, false);
  for (const alter of [
    (s: ReviewSubject) => { s.candidate = { answer: "edited" }; },
    (s: ReviewSubject) => { s.audience.push("new-recipient"); },
    (s: ReviewSubject) => { s.domain = "health"; },
    (s: ReviewSubject) => { s.accessMode = "ARCHITECT"; },
    (s: ReviewSubject) => { s.policyVersion = "other"; },
    (s: ReviewSubject) => { s.requester = "reviewer"; }
  ]) {
    const copy = structuredClone(subject); alter(copy);
    assert.equal(simulateReleaseReview(copy, records, context).review_complete, false);
  }
  for (const alter of [
    (r: ReviewRecord[]) => { r[0].evidence = "UNVERIFIED"; },
    (r: ReviewRecord[]) => { r[0].authorityClaims = "PENDING"; },
    (r: ReviewRecord[]) => { r[0].outputChecks = "FAIL"; },
    (r: ReviewRecord[]) => { r[0].revoked = true; },
    (r: ReviewRecord[]) => { r[0].expiresAt = 100; },
    (r: ReviewRecord[]) => { r[0].reviewedAt = 101; },
    (r: ReviewRecord[]) => { r[0].decision = "REJECT"; },
    (r: ReviewRecord[]) => { r[1].reviewer = "reviewer"; }
  ]) {
    const copy = structuredClone(records); alter(copy);
    assert.equal(simulateReleaseReview(subject, copy, context).review_complete, false);
  }
  assert.equal(simulateReleaseReview(subject, records, { ...context, now: 200 }).review_complete, false);
  for (const mode of ["DEFAULT", "GOVERNANCE", "ARCHITECT"] as const) {
    assert.equal(simulateAccess({ ...base, mode }, context).access_authorized, false);
  }
}
