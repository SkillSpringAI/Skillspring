import Ajv from "ajv";
import snapshotSchema from "../../schemas/review-policy/snapshot.draft.v1.schema.json";
import requestSchema from "../../schemas/review-policy/request.draft.v1.schema.json";
import subjectSchema from "../../schemas/review-policy/subject.draft.v1.schema.json";
import recordsSchema from "../../schemas/review-policy/records.draft.v1.schema.json";
import { draftPolicy } from "./policy.js";
import { hashPolicyJson, simulateAccess, simulateReleaseReview, type PolicyContext, type Resource, type Clearance, type AccessMode, type Operation, type ReviewSubject, type ReviewRecord } from "./simulate.js";

export const policyDigest = hashPolicyJson(draftPolicy);
export type ScopedRequest = {
  actor: string; mode: AccessMode; domain: string; resource: string; operation: Operation;
  purpose: string; environment: string; organization: string; policy_digest: string;
};
export type ScopedSubject = ReviewSubject & Pick<ScopedRequest, "purpose" | "environment" | "organization" | "policy_digest">;
type Denial = {
  id: string; actors: string[]; domains: string[]; resources: string[];
  modes: AccessMode[]; operations: Operation[]; purposes: string[]; environments: string[];
};
export type PolicySnapshot = Omit<PolicyContext, "now" | "resources" | "clearances"> & {
  schema_version: "skillspring.policy-snapshot.draft.v1"; id: string; organization: string;
  policy_digest: string; issued_at: number; expires_at: number;
  resources: (Resource & { environment: string })[];
  clearances: (Clearance & { purposes: string[]; environments: string[] })[];
  denials: Denial[];
};

/** Out-of-band verifier output. Use signed-boundary wrappers for signed simulation inputs. */
export type VerifiedSnapshotReceipt = {
  snapshot_id: string; snapshot_digest: string; organization: string; now: number;
};
const ajv = new Ajv({ strict: true, ownProperties: true });
const validateSnapshot = ajv.compile<PolicySnapshot>(snapshotSchema);
const validateRequest = ajv.compile<ScopedRequest>(requestSchema);
const validateSubject = ajv.compile<ScopedSubject>(subjectSchema);
const validateRecords = ajv.compile<ReviewRecord[]>(recordsSchema);

function checkSnapshot(snapshot: unknown, receipt: VerifiedSnapshotReceipt): snapshot is PolicySnapshot {
  return validateSnapshot(snapshot) && Number.isSafeInteger(receipt.now) && receipt.now >= 0 &&
    snapshot.id === receipt.snapshot_id && snapshot.organization === receipt.organization &&
    snapshot.policy_digest === policyDigest && hashPolicyJson(snapshot) === receipt.snapshot_digest &&
    snapshot.issued_at <= receipt.now && receipt.now < snapshot.expires_at &&
    [snapshot.principals, snapshot.resources, snapshot.clearances, snapshot.denials].every(items =>
      new Set(items.map(item => item.id)).size === items.length);
}
const matches = (values: string[], value: string) => values.includes("*") || values.includes(value);
function denied(request: ScopedRequest, snapshot: PolicySnapshot): boolean {
  return snapshot.denials.some(rule => matches(rule.actors, request.actor) && matches(rule.domains, request.domain) &&
    matches(rule.resources, request.resource) && rule.modes.includes(request.mode) && rule.operations.includes(request.operation) &&
    matches(rule.purposes, request.purpose) && matches(rule.environments, request.environment));
}
function scopeMatches(request: ScopedRequest, snapshot: PolicySnapshot): boolean {
  return request.organization === snapshot.organization && request.policy_digest === policyDigest &&
    snapshot.resources.some(resource => resource.id === request.resource && resource.environment === request.environment);
}
function contextFor(request: ScopedRequest, snapshot: PolicySnapshot, now: number): PolicyContext {
  return { ...snapshot, now, clearances: snapshot.clearances.filter(grant =>
    grant.purposes.includes(request.purpose) && grant.environments.includes(request.environment)) };
}

/** Schema-validated simulation. Never wire its result to a filesystem or release controller. */
export function checkScopedAccess(request: unknown, snapshot: unknown, receipt: VerifiedSnapshotReceipt) {
  const reject = (reason: string) => ({ status: "SIMULATION_ONLY" as const, would_permit: false, reason, access_authorized: false as const });
  try {
    if (!validateRequest(request)) return reject("INVALID_REQUEST");
    if (!checkSnapshot(snapshot, receipt)) return reject("INVALID_OR_STALE_SNAPSHOT");
    if (!scopeMatches(request, snapshot)) return reject("SCOPE_OR_POLICY_MISMATCH");
    if (denied(request, snapshot)) return reject("EXPLICIT_DENIAL");
    return simulateAccess(request, contextFor(request, snapshot, receipt.now));
  } catch { return reject("INVALID_CONTEXT"); }
}

export function checkScopedReview(subject: unknown, records: unknown, snapshot: unknown, receipt: VerifiedSnapshotReceipt) {
  const reject = (reason: string) => ({ status: "SIMULATION_ONLY" as const, review_complete: false, reason, release_authorized: false as const });
  try {
    if (!validateSubject(subject) || !validateRecords(records)) return reject("INVALID_REVIEW_CONTRACT");
    if (!checkSnapshot(snapshot, receipt)) return reject("INVALID_OR_STALE_SNAPSHOT");
    const request: ScopedRequest = {
      actor: subject.requester, mode: subject.accessMode, domain: subject.domain, resource: subject.resource,
      operation: "review_release", purpose: subject.purpose, environment: subject.environment,
      organization: subject.organization, policy_digest: subject.policy_digest
    };
    if (!scopeMatches(request, snapshot)) return reject("SCOPE_OR_POLICY_MISMATCH");
    // Every recipient must retain scoped read access; review approval is not data access.
    for (const actor of subject.audience) {
      if (!checkScopedAccess({ ...request, actor, operation: "read" }, snapshot, receipt).would_permit) return reject("AUDIENCE_ACCESS_DENIED");
    }
    if (denied(request, snapshot)) return reject("EXPLICIT_DENIAL");
    const context = contextFor(request, snapshot, receipt.now);
    // Explicit denial removes reviewer clearance without discarding rejection records.
    context.clearances = context.clearances.filter(grant => !denied({ ...request, actor: grant.subject }, snapshot));
    return simulateReleaseReview(subject, records, context);
  } catch { return reject("INVALID_CONTEXT"); }
}
