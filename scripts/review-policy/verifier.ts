import { createPublicKey, verify, type KeyObject } from "node:crypto";
import Ajv from "ajv";
import envelopeSchema from "../../schemas/review-policy/signed-artifact.draft.v1.schema.json";
import snapshotSchema from "../../schemas/review-policy/snapshot.draft.v1.schema.json";
import recordsSchema from "../../schemas/review-policy/records.draft.v1.schema.json";
import { hashPolicyJson, type ReviewRecord } from "./simulate.js";
import { policyDigest, type PolicySnapshot, type VerifiedSnapshotReceipt } from "./boundary.js";

export type SignedArtifact = {
  schema_version: "skillspring.signed-policy-artifact.draft.v1";
  algorithm: "Ed25519"; kind: "snapshot" | "review"; key_id: string;
  organization: string; artifact_id: string; revision: number;
  issued_at: number; expires_at: number; payload: unknown; signature: string;
};
export type TrustedKey = {
  id: string; organization: string; principal: string; publicKeyPem: string;
  purposes: ("snapshot" | "review")[]; notBefore: number; expiresAt: number;
};
type Failure = { ok: false; code: string };
type Verified = { ok: true; envelope: SignedArtifact };
const ajv = new Ajv({ strict: true, ownProperties: true });
const validEnvelope = ajv.compile<SignedArtifact>(envelopeSchema);
const validSnapshot = ajv.compile<PolicySnapshot>(snapshotSchema);
const validRecord = ajv.compile<ReviewRecord>(recordsSchema.items);

/** Signature covers a domain separator plus the canonical unsigned envelope hash. */
export function artifactSigningBytes(envelope: Omit<SignedArtifact, "signature">): Buffer {
  return Buffer.from(`SkillSpring signed policy artifact draft v1\n${hashPolicyJson(envelope)}`, "utf8");
}

/** Test-only verifier. State and trust anchors are local, not durable or remotely managed. */
export class InMemoryPolicyVerifier {
  #keys = new Map<string, TrustedKey & { publicKey: KeyObject }>();
  #revokedKeys = new Set<string>();
  #revokedArtifacts = new Set<string>();
  #latest = new Map<string, { revision: number; digest: string }>();
  #lastTime = -1;
  constructor(readonly organization: string, trustedKeys: TrustedKey[]) {
    if (!organization) throw new Error("INVALID_TRUST_CONFIGURATION");
    for (const key of trustedKeys) {
      if (!key.id || !key.principal || key.organization !== organization || this.#keys.has(key.id) ||
          !key.purposes.length || key.purposes.some(p => p !== "snapshot" && p !== "review") ||
          !Number.isSafeInteger(key.notBefore) || key.notBefore < 0 || !Number.isSafeInteger(key.expiresAt) ||
          key.expiresAt <= key.notBefore) throw new Error("INVALID_TRUST_CONFIGURATION");
      const publicKey = createPublicKey(key.publicKeyPem);
      if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("INVALID_TRUST_CONFIGURATION");
      this.#keys.set(key.id, { ...key, purposes: [...key.purposes], publicKey });
    }
  }
  revokeKey(keyId: string) { this.#revokedKeys.add(keyId); }
  revokeArtifact(kind: SignedArtifact["kind"], artifactId: string) {
    this.#revokedArtifacts.add(JSON.stringify([kind, artifactId]));
  }

  #verify(input: unknown, kind: SignedArtifact["kind"], now: number, expectedSubjectHash?: string): Verified | Failure {
    const fail = (code: string): Failure => ({ ok: false, code });
    try {
      if (!Number.isSafeInteger(now) || now < 0 || now < this.#lastTime) return fail("INVALID_OR_ROLLED_BACK_CLOCK");
      // Snapshot the JSON input so later caller edits cannot alter verified values.
      const envelope: unknown = structuredClone(input);
      if (!validEnvelope(envelope) || envelope.kind !== kind) return fail("INVALID_ENVELOPE");
      if (envelope.organization !== this.organization) return fail("ORGANIZATION_MISMATCH");
      const key = this.#keys.get(envelope.key_id);
      if (!key || !key.purposes.includes(kind)) return fail("UNTRUSTED_SIGNER");
      if (this.#revokedKeys.has(key.id)) return fail("KEY_REVOKED");
      if (this.#revokedArtifacts.has(JSON.stringify([kind, envelope.artifact_id]))) return fail("ARTIFACT_REVOKED");
      if (envelope.issued_at < key.notBefore || now < key.notBefore || now >= key.expiresAt ||
          envelope.expires_at > key.expiresAt || envelope.issued_at > now || now >= envelope.expires_at ||
          envelope.expires_at <= envelope.issued_at) return fail("OUTSIDE_VALIDITY_WINDOW");
      const { signature, ...unsigned } = envelope;
      const bytes = Buffer.from(signature, "base64");
      if (bytes.toString("base64") !== signature || !verify(null, artifactSigningBytes(unsigned), key.publicKey, bytes)) return fail("INVALID_SIGNATURE");
      if (kind === "snapshot") {
        const payload = envelope.payload;
        if (!validSnapshot(payload) || payload.id !== envelope.artifact_id || payload.organization !== envelope.organization ||
            payload.policy_digest !== policyDigest || payload.issued_at !== envelope.issued_at || payload.expires_at !== envelope.expires_at ||
            ![payload.principals, payload.resources, payload.clearances, payload.denials].every(items =>
              new Set(items.map(item => item.id)).size === items.length)) return fail("INVALID_SNAPSHOT_PAYLOAD");
      } else {
        const payload = envelope.payload;
        if (!validRecord(payload) || payload.id !== envelope.artifact_id || payload.reviewer !== key.principal ||
            payload.subjectHash !== expectedSubjectHash || payload.reviewedAt !== envelope.issued_at ||
            payload.expiresAt !== envelope.expires_at || payload.revoked) return fail("INVALID_REVIEW_PAYLOAD");
      }
      // Snapshot revisions span the organization, not a caller-chosen snapshot ID.
      const stream = JSON.stringify([kind, kind === "snapshot" ? "organization-snapshot" : envelope.artifact_id]);
      const digest = hashPolicyJson(unsigned);
      const last = this.#latest.get(stream);
      if (last && envelope.revision < last.revision) return fail("REVISION_ROLLBACK");
      if (last && envelope.revision === last.revision && digest !== last.digest) return fail("REVISION_CONFLICT");
      this.#latest.set(stream, { revision: envelope.revision, digest });
      this.#lastTime = now;
      return { ok: true, envelope };
    } catch { return fail("INVALID_ARTIFACT"); }
  }

  verifySnapshot(input: unknown, now: number): Failure | {
    ok: true; snapshot: PolicySnapshot; receipt: VerifiedSnapshotReceipt; revision: number;
  } {
    const verified = this.#verify(input, "snapshot", now);
    if (!verified.ok) return verified;
    const snapshot = verified.envelope.payload as PolicySnapshot;
    return { ok: true, snapshot, revision: verified.envelope.revision,
      receipt: { snapshot_id: snapshot.id, snapshot_digest: hashPolicyJson(snapshot), organization: this.organization, now } };
  }

  verifyReview(input: unknown, expectedSubjectHash: string, now: number): Failure | { ok: true; record: ReviewRecord; revision: number } {
    const verified = this.#verify(input, "review", now, expectedSubjectHash);
    if (!verified.ok) return verified;
    return { ok: true, record: verified.envelope.payload as ReviewRecord, revision: verified.envelope.revision };
  }
}
