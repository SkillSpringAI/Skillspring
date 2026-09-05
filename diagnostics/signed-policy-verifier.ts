import assert from "node:assert/strict";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { InMemoryPolicyVerifier, artifactSigningBytes, type SignedArtifact, type TrustedKey } from "../scripts/review-policy/verifier.js";
import { checkSignedAccess, checkSignedReview } from "../scripts/review-policy/signed-boundary.js";
import { makePolicySnapshotFixture } from "./scoped-policy-boundary.js";
import { policyDigest, type ScopedSubject } from "../scripts/review-policy/boundary.js";
import { draftPolicy } from "../scripts/review-policy/policy.js";
import { reviewSubjectHash, type ReviewRecord } from "../scripts/review-policy/simulate.js";

export function checkSignedPolicyVerifier() {
  // Ephemeral test keys only; no private key is stored or logged.
  const old = generateKeyPairSync("ed25519");
  const next = generateKeyPairSync("ed25519");
  const reviewer = generateKeyPairSync("ed25519");
  const trust = (id: string, key: KeyObject, principal: string, purposes: TrustedKey["purposes"]): TrustedKey => ({
    id, organization: "team-a", principal, purposes, notBefore: 0, expiresAt: 1000,
    publicKeyPem: key.export({ type: "spki", format: "pem" }).toString()
  });
  const keys = [trust("old", old.publicKey, "publisher", ["snapshot"]),
    trust("next", next.publicKey, "publisher", ["snapshot"]), trust("reviewer", reviewer.publicKey, "reviewer", ["review"])];
  const fresh = () => new InMemoryPolicyVerifier("team-a", keys);
  const seal = (unsigned: Omit<SignedArtifact, "signature">, key = old.privateKey): SignedArtifact => ({
    ...unsigned, signature: sign(null, artifactSigningBytes(unsigned), key).toString("base64")
  });
  const unsigned: Omit<SignedArtifact, "signature"> = {
    schema_version: "skillspring.signed-policy-artifact.draft.v1", algorithm: "Ed25519", kind: "snapshot",
    key_id: "old", organization: "team-a", artifact_id: "snapshot-1", revision: 1,
    issued_at: 0, expires_at: 200, payload: makePolicySnapshotFixture()
  };
  const v1 = seal(unsigned);
  const request = { actor: "alice", mode: "DEFAULT", domain: "engineering", resource: "public/guide",
    operation: "read", purpose: "education", environment: "development", organization: "team-a", policy_digest: policyDigest };
  const verifier = fresh();
  assert.equal(checkSignedAccess(request, v1, verifier, 100).would_permit, true);
  assert.equal(checkSignedAccess(request, v1, verifier, 100).access_authorized, false);
  assert.equal(verifier.verifySnapshot(v1, 99).ok, false);
  const tampered = structuredClone(v1); (tampered.payload as any).clearances[0].operations.push("debug");
  assert.equal(checkSignedAccess(request, tampered, fresh(), 100).reason, "INVALID_SIGNATURE");
  for (const altered of [
    { ...unsigned, organization: "team-b" }, { ...unsigned, key_id: "unknown" },
    { ...unsigned, revision: 0 }, { ...unsigned, algorithm: "RSA" as "Ed25519" }
  ]) assert.equal(fresh().verifySnapshot(seal(altered), 100).ok, false);
  const badSignature = { ...v1, signature: sign(null, artifactSigningBytes(unsigned), next.privateKey).toString("base64") };
  assert.equal(checkSignedAccess(request, badSignature, fresh(), 100).reason, "INVALID_SIGNATURE");
  assert.equal(fresh().verifySnapshot(v1, 200).ok, false);
  const expiredKey = new InMemoryPolicyVerifier("team-a", keys.map(key => key.id === "old" ? { ...key, expiresAt: 100 } : key));
  assert.equal(checkSignedAccess(request, v1, expiredKey, 100).reason, "OUTSIDE_VALIDITY_WINDOW");
  const futureKey = new InMemoryPolicyVerifier("team-a", keys.map(key => key.id === "old" ? { ...key, notBefore: 101 } : key));
  assert.equal(checkSignedAccess(request, v1, futureKey, 100).reason, "OUTSIDE_VALIDITY_WINDOW");
  const future = seal({ ...unsigned, issued_at: 101 });
  assert.equal(fresh().verifySnapshot(future, 100).ok, false);
  const keyRevoked = fresh(); keyRevoked.revokeKey("old");
  assert.equal(checkSignedAccess(request, v1, keyRevoked, 100).reason, "KEY_REVOKED");
  const artifactRevoked = fresh(); artifactRevoked.revokeArtifact("snapshot", "snapshot-1");
  assert.equal(checkSignedAccess(request, v1, artifactRevoked, 100).reason, "ARTIFACT_REVOKED");
  const v2Payload = makePolicySnapshotFixture(); v2Payload.id = "snapshot-2";
  const v2 = seal({ ...unsigned, revision: 2, artifact_id: "snapshot-2", payload: v2Payload, key_id: "next" }, next.privateKey);
  assert.equal(verifier.verifySnapshot(v2, 100).ok, true);
  assert.equal(checkSignedAccess(request, v1, verifier, 100).reason, "REVISION_ROLLBACK");
  const conflict = seal({ ...unsigned, revision: 2, artifact_id: "snapshot-3", payload: { ...v2Payload, id: "snapshot-3" }, key_id: "next" }, next.privateKey);
  assert.equal(checkSignedAccess(request, conflict, verifier, 100).reason, "REVISION_CONFLICT");
  verifier.revokeKey("old");
  assert.equal(verifier.verifySnapshot(v2, 100).ok, true);
  // Invalid higher revisions cannot poison the high-water mark.
  const poisoned = { ...v1, revision: 999 };
  const clean = fresh(); assert.equal(clean.verifySnapshot(poisoned, 100).ok, false);
  assert.equal(clean.verifySnapshot(v1, 100).ok, true);

  const subject: ScopedSubject = { candidate: { text: "fixture" }, accessMode: "DEFAULT", domain: "engineering",
    resource: "public/guide", audience: ["alice"], requester: "alice", producer: "model", policyVersion: draftPolicy.version,
    purpose: "education", environment: "development", organization: "team-a", policy_digest: policyDigest };
  const record: ReviewRecord = { id: "review-1", reviewer: "reviewer", role: "domain_reviewer",
    subjectHash: reviewSubjectHash(subject), decision: "APPROVE", evidence: "VERIFIED", authorityClaims: "CLEARED",
    outputChecks: "PASS", reviewedAt: 50, expiresAt: 200, revoked: false };
  const reviewUnsigned: Omit<SignedArtifact, "signature"> = { ...unsigned, kind: "review", key_id: "reviewer",
    artifact_id: record.id, issued_at: 50, payload: record };
  const signedReview = seal(reviewUnsigned, reviewer.privateKey);
  const reviewsVerifier = fresh();
  const complete = checkSignedReview(subject, [signedReview], v1, reviewsVerifier, 100);
  assert.equal(complete.review_complete, true); assert.equal(complete.release_authorized, false);
  const wrongSubject = { ...subject, audience: ["other"] };
  assert.equal(checkSignedReview(wrongSubject, [signedReview], v1, fresh(), 100).review_complete, false);
  const wrongReviewer = seal({ ...reviewUnsigned, payload: { ...record, reviewer: "alice" } }, reviewer.privateKey);
  assert.equal(checkSignedReview(subject, [wrongReviewer], v1, fresh(), 100).reason, "INVALID_REVIEW_PAYLOAD");
  const wrongPurpose = seal({ ...reviewUnsigned, key_id: "old" });
  assert.equal(checkSignedReview(subject, [wrongPurpose], v1, fresh(), 100).reason, "UNTRUSTED_SIGNER");
  reviewsVerifier.revokeKey("reviewer");
  assert.equal(checkSignedReview(subject, [signedReview], v1, reviewsVerifier, 100).reason, "KEY_REVOKED");
  const revokedReview = fresh(); revokedReview.revokeArtifact("review", "review-1");
  assert.equal(checkSignedReview(subject, [signedReview], v1, revokedReview, 100).reason, "ARTIFACT_REVOKED");
  const rejected = seal({ ...reviewUnsigned, revision: 2, payload: { ...record, decision: "REJECT" } }, reviewer.privateKey);
  const rev = fresh();
  assert.equal(checkSignedReview(subject, [rejected], v1, rev, 100).reason, "REVIEW_REJECTED");
  assert.equal(checkSignedReview(subject, [signedReview], v1, rev, 100).reason, "REVISION_ROLLBACK");
  const changedRecord = { ...signedReview, payload: { ...record, evidence: "UNVERIFIED" } };
  assert.equal(checkSignedReview(subject, [changedRecord], v1, fresh(), 100).reason, "INVALID_SIGNATURE");
  const duplicateKeys = [...keys, keys[0]];
  assert.throws(() => new InMemoryPolicyVerifier("team-a", duplicateKeys), /INVALID_TRUST_CONFIGURATION/);
  assert.equal(fresh().verifySnapshot(null, 100).ok, false);
  // Known boundary: rebuilding this in-memory verifier discards history.
  assert.equal(fresh().verifySnapshot(v1, 100).ok, true);
}
