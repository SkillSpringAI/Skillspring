import { createHash } from "node:crypto";
import { draftPolicy } from "./policy.js";

export type AccessMode = keyof typeof draftPolicy.modes;
export type Role = "user" | "domain_reviewer" | "governance_officer" | "engineering_maintainer" | "access_administrator";
export type ResourceClass = "public" | "domain_restricted" | "engineering_sandbox" | "protected";
export type Operation = "read" | "request_review" | "test" | "debug" | "propose_change" | "review_evidence" | "review_release";
export type Principal = { id: string; roles: Role[]; domains: string[] };
export type Resource = { id: string; domain: string; classification: ResourceClass };
export type Clearance = {
  id: string; subject: string; role: Role; issuer: string; domain: string;
  modes: AccessMode[]; resources: string[]; operations: Operation[];
  issuedAt: number; expiresAt: number; revoked: boolean;
};
export type IssuerMandate = { issuer: string; domains: string[]; roles: Role[]; modes: AccessMode[] };
export type PolicyContext = {
  principals: Principal[]; resources: Resource[]; clearances: Clearance[];
  issuerMandates: IssuerMandate[]; now: number;
};
type AccessRequest = { actor: string; mode: AccessMode; domain: string; resource: string; operation: Operation };

function includes(values: readonly string[], value: string) { return values.includes(value); }
function uniqueIds(items: { id: string }[]) { return new Set(items.map(item => item.id)).size === items.length; }

function hasClearance(request: AccessRequest, role: Role, context: PolicyContext): boolean {
  return context.clearances.some(clearance => {
    const issuer = context.principals.find(p => p.id === clearance.issuer);
    return clearance.subject === request.actor && clearance.role === role && clearance.domain === request.domain &&
      includes(clearance.modes, request.mode) && includes(clearance.resources, request.resource) &&
      includes(clearance.operations, request.operation) && !clearance.revoked &&
      Number.isFinite(clearance.issuedAt) && Number.isFinite(clearance.expiresAt) &&
      clearance.issuedAt <= context.now && context.now < clearance.expiresAt &&
      clearance.issuer !== request.actor && issuer?.roles.includes("access_administrator") &&
      issuer.domains.includes(request.domain) && context.issuerMandates.some(mandate =>
        mandate.issuer === clearance.issuer && mandate.domains.includes(request.domain) &&
        mandate.roles.includes(role) && mandate.modes.includes(request.mode));
  });
}

/** Non-operative policy exploration; this result is never a token or access grant. */
export function simulateAccess(request: AccessRequest, context: PolicyContext) {
  const result = (wouldPermit: boolean, reason: string) => ({
    status: "SIMULATION_ONLY" as const, would_permit: wouldPermit, reason, access_authorized: false as const
  });
  if (!Number.isFinite(context.now) || !uniqueIds(context.principals) || !uniqueIds(context.resources) ||
      !uniqueIds(context.clearances)) return result(false, "INVALID_CONTEXT");
  if (!Object.hasOwn(draftPolicy.modes, request.mode)) return result(false, "UNKNOWN_MODE");
  const actor = context.principals.find(p => p.id === request.actor);
  const resource = context.resources.find(r => r.id === request.resource);
  if (!actor || !resource) return result(false, "UNKNOWN_PRINCIPAL_OR_RESOURCE");
  if (resource.classification === "protected") return result(false, "PROTECTED_RESOURCE");
  if (resource.domain !== request.domain || !actor.domains.includes(request.domain)) return result(false, "DOMAIN_MISMATCH");
  const mode = draftPolicy.modes[request.mode];
  if (!includes(mode.classes, resource.classification) || !includes(mode.operations, request.operation)) return result(false, "MODE_SCOPE_DENIED");
  const roles = actor.roles.filter(role => includes(mode.roles, role));
  if (!roles.length) return result(false, "ROLE_DENIED");
  if (!roles.some(role => hasClearance(request, role, context))) return result(false, "CLEARANCE_REQUIRED");
  return result(true, "WITHIN_EXPLICIT_CLEARANCE");
}

export type ReviewSubject = {
  candidate: unknown; accessMode: AccessMode; domain: string; resource: string;
  audience: string[]; requester: string; producer: string; policyVersion: string;
};
export type ReviewRecord = {
  id: string; reviewer: string; role: Role; subjectHash: string; decision: "APPROVE" | "REJECT";
  evidence: "VERIFIED" | "UNVERIFIED"; authorityClaims: "CLEARED" | "PENDING";
  outputChecks: "PASS" | "FAIL"; reviewedAt: number; expiresAt: number; revoked: boolean;
};
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  throw new Error("Review subjects must be plain JSON");
}
export function reviewSubjectHash(subject: ReviewSubject) {
  return hashPolicyJson(subject);
}

export function hashPolicyJson(value: unknown) {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

/** Checks hypothetical review completeness only; never releases candidate text. */
export function simulateReleaseReview(subject: ReviewSubject, records: ReviewRecord[], context: PolicyContext) {
  const result = (ready: boolean, reason: string) => ({
    status: "SIMULATION_ONLY" as const, review_complete: ready, reason, release_authorized: false as const
  });
  if (!Object.hasOwn(draftPolicy.reviewerRoles, subject.accessMode) || subject.policyVersion !== draftPolicy.version ||
      !Number.isFinite(context.now) || !uniqueIds(context.principals) || !uniqueIds(context.resources) ||
      !uniqueIds(context.clearances) || !uniqueIds(records) || !subject.audience.length) return result(false, "INVALID_CONTEXT");
  const resource = context.resources.find(r => r.id === subject.resource);
  if (!resource || resource.classification === "protected" || resource.domain !== subject.domain ||
      !includes(draftPolicy.modes[subject.accessMode].classes, resource.classification)) return result(false, "RESOURCE_DENIED");
  let binding: string;
  try { binding = reviewSubjectHash(subject); } catch { return result(false, "INVALID_SUBJECT"); }
  const reviews = records.filter(record => record.subjectHash === binding);
  if (reviews.some(record => record.decision === "REJECT")) return result(false, "REVIEW_REJECTED");
  const requiredRoles = draftPolicy.reviewerRoles[subject.accessMode];
  const reviewers = new Set<string>();
  for (const role of requiredRoles) {
    const review = reviews.find(record => {
      const principal = context.principals.find(p => p.id === record.reviewer);
      return record.role === role && record.decision === "APPROVE" && record.evidence === "VERIFIED" &&
        record.authorityClaims === "CLEARED" && record.outputChecks === "PASS" && !record.revoked &&
        Number.isFinite(record.reviewedAt) && Number.isFinite(record.expiresAt) &&
        record.reviewedAt <= context.now && context.now < record.expiresAt &&
        record.reviewer !== subject.requester && record.reviewer !== subject.producer && !reviewers.has(record.reviewer) &&
        principal?.roles.includes(role) && principal.domains.includes(subject.domain) &&
        hasClearance({ actor: record.reviewer, mode: subject.accessMode, domain: subject.domain,
          resource: subject.resource, operation: "review_release" }, role, context);
    });
    if (!review) return result(false, "QUALIFIED_REVIEW_REQUIRED");
    reviewers.add(review.reviewer);
  }
  return result(true, "REVIEW_COMPLETE_NOT_RELEASE_AUTHORITY");
}
