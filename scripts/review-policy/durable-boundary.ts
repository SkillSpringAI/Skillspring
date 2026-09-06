import Ajv from "ajv";
import subjectSchema from "../../schemas/review-policy/subject.draft.v1.schema.json";
import { InMemoryPolicyVerifier, type SignedArtifact, type TrustedKey } from "./verifier.js";
import { hashPolicyJson, reviewSubjectHash, type ReviewRecord } from "./simulate.js";
import { checkScopedAccess, checkScopedReview, type ScopedSubject } from "./boundary.js";
import type { HistoryEvent, PolicyHistoryStore } from "./history-store.js";

const validSubject = new Ajv({ strict: true, ownProperties: true }).compile<ScopedSubject>(subjectSchema);
export function policyTrustDigest(keys: TrustedKey[]) {
  return hashPolicyJson([...keys].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
class Denied extends Error {}
function requireCondition(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Denied(reason);
}
const exactKeys = (value: object, keys: string[]) => Object.keys(value).sort().join(",") === keys.sort().join(",");

/** Rebuilt under the store's transaction lock; no verifier state survives a failed write. */
class Projection {
  verifier: InMemoryPolicyVerifier;
  now = -1;
  reviews = new Map<string, SignedArtifact>();
  rejected = new Set<string>();
  #identities = new Map<string, string>();
  #recordOwners = new Map<string, string>();
  constructor(organization: string, keys: TrustedKey[]) { this.verifier = new InMemoryPolicyVerifier(organization, keys); }
  apply(event: HistoryEvent) {
    requireCondition(event && typeof event === "object" && Number.isSafeInteger(event.now) &&
      event.now >= 0 && event.now >= this.now, "INVALID_OR_ROLLED_BACK_CLOCK");
    if (event.type === "artifact") {
      requireCondition(exactKeys(event, ["type", "now", "artifact", "subjectHash"]), "INVALID_HISTORY_EVENT");
      const envelope = event.artifact;
      if (envelope?.kind === "snapshot") {
        requireCondition(event.subjectHash === null, "INVALID_HISTORY_EVENT");
        const result = this.verifier.verifySnapshot(envelope, event.now);
        if (!result.ok) throw new Denied(result.code);
      } else {
        requireCondition(typeof event.subjectHash === "string" && /^sha256:[a-f0-9]{64}$/.test(event.subjectHash), "INVALID_SUBJECT_HASH");
        const result = this.verifier.verifyReview(envelope, event.subjectHash, event.now);
        if (!result.ok) throw new Denied(result.code);
        const record = result.record;
        const owner = JSON.stringify([record.reviewer, record.subjectHash]);
        requireCondition(!this.#identities.has(owner) || this.#identities.get(owner) === record.id, "REVIEW_IDENTITY_CONFLICT");
        requireCondition(!this.#recordOwners.has(record.id) || this.#recordOwners.get(record.id) === owner, "REVIEW_IDENTITY_CONFLICT");
        this.#identities.set(owner, record.id); this.#recordOwners.set(record.id, owner);
        this.reviews.set(record.id, structuredClone(envelope));
        if (record.decision === "REJECT") this.rejected.add(record.subjectHash);
      }
    } else if (event.type === "revoke-key") {
      requireCondition(exactKeys(event, ["type", "now", "keyId"]) && typeof event.keyId === "string" && event.keyId.length > 0,
        "INVALID_HISTORY_EVENT");
      this.verifier.revokeKey(event.keyId);
    } else if (event.type === "revoke-artifact") {
      requireCondition(exactKeys(event, ["type", "now", "kind", "artifactId"]) &&
        ["snapshot", "review"].includes(event.kind) && typeof event.artifactId === "string" && event.artifactId.length > 0,
        "INVALID_HISTORY_EVENT");
      this.verifier.revokeArtifact(event.kind, event.artifactId);
    } else throw new Denied("INVALID_HISTORY_EVENT");
    this.now = event.now;
  }
}

/** Complete relative to this trusted store's accepted history only. Always simulation-only. */
export class DurablePolicySimulation {
  #keys: TrustedKey[];
  constructor(private store: PolicyHistoryStore, keys: TrustedKey[]) {
    this.#keys = structuredClone(keys);
    new InMemoryPolicyVerifier(store.organization, this.#keys);
    if (store.trustDigest !== policyTrustDigest(this.#keys)) throw new Error("TRUST_CONFIGURATION_MISMATCH");
  }
  #transaction<T>(work: (projection: Projection, accept: (event: HistoryEvent) => void) => T): T {
    return this.store.transaction((history, append) => {
      const projection = new Projection(this.store.organization, this.#keys);
      const observed = new Set<string>();
      for (const event of history) {
        try { projection.apply(event); } catch { throw new Error("STORE_HISTORY_INVALID"); }
        observed.add(hashPolicyJson(event));
      }
      return work(projection, event => {
        projection.apply(event);
        const digest = hashPolicyJson(event);
        if (!observed.has(digest)) { append(event); observed.add(digest); }
      });
    });
  }
  #reason(error: unknown) { return error instanceof Denied ? error.message : "STORE_UNAVAILABLE_OR_CORRUPT"; }
  #accept(event: HistoryEvent) {
    try {
      this.#transaction((_projection, accept) => accept(event));
      return { status: "SIMULATION_ONLY" as const, accepted: true, reason: "RECORDED", access_authorized: false as const, release_authorized: false as const };
    } catch (error) {
      return { status: "SIMULATION_ONLY" as const, accepted: false, reason: this.#reason(error), access_authorized: false as const, release_authorized: false as const };
    }
  }
  acceptSnapshot(artifact: SignedArtifact, now: number) {
    return this.#accept({ type: "artifact", artifact, now, subjectHash: null });
  }
  acceptReview(artifact: SignedArtifact, subjectHash: string, now: number) {
    return this.#accept({ type: "artifact", artifact, now, subjectHash });
  }
  // Trusted management inputs, not public API operations. There is no un-revoke or rejection-clear operation.
  revokeKey(keyId: string, now: number) { return this.#accept({ type: "revoke-key", keyId, now }); }
  revokeArtifact(kind: "snapshot" | "review", artifactId: string, now: number) {
    return this.#accept({ type: "revoke-artifact", kind, artifactId, now });
  }
  checkAccess(request: unknown, snapshot: SignedArtifact, now: number) {
    try {
      return this.#transaction((projection, accept) => {
        accept({ type: "artifact", artifact: snapshot, now, subjectHash: null });
        const verified = projection.verifier.verifySnapshot(snapshot, now);
        if (!verified.ok) throw new Denied(verified.code);
        return checkScopedAccess(request, verified.snapshot, verified.receipt);
      });
    } catch (error) {
      return { status: "SIMULATION_ONLY" as const, would_permit: false, reason: this.#reason(error), access_authorized: false as const };
    }
  }
  /** No records argument: every accepted record for this subject is read under the same lock. */
  checkReview(subject: unknown, snapshot: SignedArtifact, now: number) {
    try {
      requireCondition(validSubject(subject), "INVALID_REVIEW_CONTRACT");
      const binding = reviewSubjectHash(subject);
      return this.#transaction((projection, accept) => {
        accept({ type: "artifact", artifact: snapshot, now, subjectHash: null });
        if (projection.rejected.has(binding)) return {
          status: "SIMULATION_ONLY" as const, review_complete: false, reason: "REVIEW_REJECTED", release_authorized: false as const
        };
        const records: ReviewRecord[] = [];
        for (const envelope of projection.reviews.values()) {
          if ((envelope.payload as ReviewRecord).subjectHash !== binding) continue;
          const review = projection.verifier.verifyReview(envelope, binding, now);
          if (!review.ok) throw new Denied(review.code);
          records.push(review.record);
        }
        const verified = projection.verifier.verifySnapshot(snapshot, now);
        if (!verified.ok) throw new Denied(verified.code);
        return checkScopedReview(subject, records, verified.snapshot, verified.receipt);
      });
    } catch (error) {
      return { status: "SIMULATION_ONLY" as const, review_complete: false, reason: this.#reason(error), release_authorized: false as const };
    }
  }
}
