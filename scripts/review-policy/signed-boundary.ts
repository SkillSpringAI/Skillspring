import { InMemoryPolicyVerifier } from "./verifier.js";
import { checkScopedAccess, checkScopedReview, type ScopedSubject } from "./boundary.js";
import { reviewSubjectHash, type ReviewRecord } from "./simulate.js";

/** Reverify signatures and revocation each call. No cached receipt is an authorization token. */
export function checkSignedAccess(request: unknown, signedSnapshot: unknown, verifier: InMemoryPolicyVerifier, now: number) {
  const verified = verifier.verifySnapshot(signedSnapshot, now);
  if (!verified.ok) return { status: "SIMULATION_ONLY" as const, would_permit: false, reason: verified.code, access_authorized: false as const };
  return checkScopedAccess(request, verified.snapshot, verified.receipt);
}

export function checkSignedReview(subject: unknown, signedRecords: unknown, signedSnapshot: unknown, verifier: InMemoryPolicyVerifier, now: number) {
  const reject = (reason: string) => ({ status: "SIMULATION_ONLY" as const, review_complete: false, reason, release_authorized: false as const });
  try {
    if (!Array.isArray(signedRecords) || signedRecords.length > 256) return reject("INVALID_REVIEW_BATCH");
    const verified = verifier.verifySnapshot(signedSnapshot, now);
    if (!verified.ok) return reject(verified.code);
    const binding = reviewSubjectHash(subject as ScopedSubject);
    const records: ReviewRecord[] = [];
    for (const signedRecord of signedRecords) {
      const review = verifier.verifyReview(signedRecord, binding, now);
      if (!review.ok) return reject(review.code);
      records.push(review.record);
    }
    return checkScopedReview(subject, records, verified.snapshot, verified.receipt);
  } catch { return reject("INVALID_REVIEW_BATCH"); }
}
