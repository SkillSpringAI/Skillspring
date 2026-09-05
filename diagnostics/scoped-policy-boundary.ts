import assert from "node:assert/strict";
import { checkScopedAccess, checkScopedReview, policyDigest, type PolicySnapshot, type ScopedRequest, type ScopedSubject } from "../scripts/review-policy/boundary.js";
import { hashPolicyJson, reviewSubjectHash, type ReviewRecord } from "../scripts/review-policy/simulate.js";
import { draftPolicy } from "../scripts/review-policy/policy.js";

export function makePolicySnapshotFixture(): PolicySnapshot {
  const snapshot: PolicySnapshot = {
    schema_version: "skillspring.policy-snapshot.draft.v1", id: "snapshot-1", organization: "team-a",
    policy_digest: policyDigest, issued_at: 0, expires_at: 200,
    principals: [
      { id: "alice", roles: ["user"], domains: ["engineering"] },
      { id: "reviewer", roles: ["domain_reviewer"], domains: ["engineering"] },
      { id: "admin", roles: ["access_administrator"], domains: ["engineering"] }
    ],
    resources: [{ id: "public/guide", domain: "engineering", classification: "public", environment: "development" }],
    issuerMandates: [{ issuer: "admin", domains: ["engineering"], roles: ["user", "domain_reviewer"], modes: ["DEFAULT"] }],
    clearances: ["alice", "reviewer"].map(subject => ({
      id: `grant-${subject}`, subject, issuer: "admin", role: subject === "alice" ? "user" : "domain_reviewer",
      domain: "engineering", modes: ["DEFAULT"], resources: ["public/guide"], operations: ["read", "review_release"],
      issuedAt: 0, expiresAt: 200, revoked: false, purposes: ["education"], environments: ["development"]
    })), denials: []
  };
  return snapshot;
}

export function checkScopedPolicyBoundary() {
  const snapshot = makePolicySnapshotFixture();
  const receiptFor = (s: PolicySnapshot) => ({ snapshot_id: s.id, snapshot_digest: hashPolicyJson(s), organization: "team-a", now: 100 });
  const receipt = receiptFor(snapshot);
  const request: ScopedRequest = { actor: "alice", mode: "DEFAULT", domain: "engineering", resource: "public/guide",
    operation: "read", purpose: "education", environment: "development", organization: "team-a", policy_digest: policyDigest };
  assert.equal(checkScopedAccess(request, snapshot, receipt).would_permit, true);
  for (const bad of [null, [], {}, { ...request, mode: "ROOT" }, { ...request, unexpected: true }, { ...request, purpose: "" }]) {
    assert.equal(checkScopedAccess(bad, snapshot, receipt).reason, "INVALID_REQUEST");
  }
  for (const field of ["organization", "environment", "policy_digest", "purpose"] as const) {
    assert.equal(checkScopedAccess({ ...request, [field]: "different" }, snapshot, receipt).would_permit, false);
  }
  const tampered = structuredClone(snapshot);
  tampered.clearances[0].purposes.push("different");
  assert.equal(checkScopedAccess(request, tampered, receipt).reason, "INVALID_OR_STALE_SNAPSHOT");
  for (const now of [200, -1, NaN, 0.5]) {
    assert.equal(checkScopedAccess(request, snapshot, { ...receipt, now }).would_permit, false);
  }
  const malformed = { ...snapshot, clearances: [{ ...snapshot.clearances[0], revoked: "false" }] };
  assert.equal(checkScopedAccess(request, malformed, receipt).would_permit, false);
  const duplicate = structuredClone(snapshot); duplicate.principals.push(duplicate.principals[0]);
  assert.equal(checkScopedAccess(request, duplicate, receiptFor(duplicate)).would_permit, false);
  const denial: PolicySnapshot["denials"][number] = { id: "deny-1", actors: ["alice"], domains: ["engineering"],
    resources: ["public/guide"], modes: ["DEFAULT"], operations: ["read"], purposes: ["education"], environments: ["development"] };
  const blocked = { ...snapshot, denials: [denial] };
  assert.equal(checkScopedAccess(request, blocked, receiptFor(blocked)).reason, "EXPLICIT_DENIAL");
  const wildcard = { ...snapshot, denials: [{ ...denial, actors: ["*"], resources: ["*"] }] };
  assert.equal(checkScopedAccess(request, wildcard, receiptFor(wildcard)).reason, "EXPLICIT_DENIAL");
  const otherPurpose = { ...snapshot, denials: [{ ...denial, purposes: ["other"] }] };
  assert.equal(checkScopedAccess(request, otherPurpose, receiptFor(otherPurpose)).would_permit, true);
  const subject: ScopedSubject = { candidate: { text: "fixture" }, accessMode: "DEFAULT", domain: "engineering",
    resource: "public/guide", audience: ["alice"], requester: "alice", producer: "model", policyVersion: draftPolicy.version,
    purpose: "education", environment: "development", organization: "team-a", policy_digest: policyDigest };
  const records: ReviewRecord[] = [{ id: "review-1", reviewer: "reviewer", role: "domain_reviewer",
    subjectHash: reviewSubjectHash(subject), decision: "APPROVE", evidence: "VERIFIED", authorityClaims: "CLEARED",
    outputChecks: "PASS", reviewedAt: 50, expiresAt: 200, revoked: false }];
  const complete = checkScopedReview(subject, records, snapshot, receipt);
  assert.equal(complete.review_complete, true);
  assert.equal(complete.release_authorized, false);
  assert.equal(checkScopedReview(subject, [{ ...records[0], revoked: "false" }], snapshot, receipt).reason, "INVALID_REVIEW_CONTRACT");
  assert.equal(checkScopedReview(subject, records, blocked, receiptFor(blocked)).reason, "AUDIENCE_ACCESS_DENIED");
  const deniedReviewer = { ...snapshot, denials: [{ ...denial, actors: ["reviewer"], operations: ["review_release" as const] }] };
  assert.equal(checkScopedReview(subject, records, deniedReviewer, receiptFor(deniedReviewer)).review_complete, false);
  const changed = { ...subject, purpose: "different" };
  assert.notEqual(reviewSubjectHash(subject), reviewSubjectHash(changed));
  assert.equal(checkScopedReview(changed, records, snapshot, receipt).review_complete, false);
  assert.equal(checkScopedReview(subject, records, null, receipt).review_complete, false);
}
