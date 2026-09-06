import Ajv from "ajv";
import addFormats from "ajv-formats";
import candidateSchema from "../../schemas/outputs/generated-answer-candidate.v1.schema.json";
import packageSchema from "../../schemas/review-policy/candidate-package.draft.v1.schema.json";
import subjectSchema from "../../schemas/review-policy/subject.draft.v1.schema.json";
import assessmentSchema from "../../schemas/review-policy/candidate-assessment.draft.v1.schema.json";
import { hashAnswerText, validateAnswerCandidate, type CandidateContext, type GeneratedAnswerCandidateV1 } from "../../runtime/answers/candidate.js";
import { assertAdmissible } from "../../runtime/outputGate.js";
import { hashPolicyJson, type CandidateAssessment, type ReviewRecord } from "./simulate.js";
import { policyDigest, type ScopedSubject } from "./boundary.js";
import { draftPolicy } from "./policy.js";

export type EvidenceReceipt = {
  source_id: string; content_sha256: string; resource: string; organization: string;
  domain: string; origin: string; captured_at: string;
};
export type EvidenceSource = EvidenceReceipt & { text: string };
export type EvidenceClaim = {
  id: string; start: number; end: number;
  support: { source_id: string; start: number; end: number }[];
};
/** Captured out of band by the invocation/source controllers, never derived from model text. */
export type CandidateReviewContext = { candidateContext: CandidateContext; evidenceReceipts: EvidenceReceipt[] };
export type CandidateReviewPackage = {
  schema_version: "skillspring.candidate-review-package.draft.v1";
  requirements: "sourced-informational-review-v1";
  candidate: GeneratedAnswerCandidateV1; context_sha256: string;
  sources: EvidenceSource[]; claims: EvidenceClaim[];
};
const ajv = new Ajv({ strict: true, ownProperties: true });
addFormats(ajv); ajv.addSchema(candidateSchema);
const validPackage = ajv.compile<CandidateReviewPackage>(packageSchema);
const validSubject = ajv.compile<ScopedSubject>(subjectSchema);
const validAssessment = ajv.compile<CandidateAssessment>(assessmentSchema);
const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const contextHash = (context: CandidateReviewContext) => hashPolicyJson(jsonCopy(context));
class Invalid extends Error {}
const requireValue = (condition: unknown, code: string) => { if (!condition) throw new Invalid(code); };
const unique = (ids: string[]) => new Set(ids).size === ids.length;

/** Structural/source checks only. Does not infer entailment, factual accuracy, or reviewer authority. */
export function validateCandidateReviewSubject(subject: unknown, context: CandidateReviewContext, now: number):
  { ok: true; package: CandidateReviewPackage } | { ok: false; reason: string } {
  try {
    requireValue(Number.isSafeInteger(now) && now >= 0, "INVALID_REVIEW_TIME");
    if (!validSubject(subject) || !validPackage(subject.candidate)) return { ok: false, reason: "INVALID_CANDIDATE_REVIEW_PACKAGE" };
    const pkg = subject.candidate;
    requireValue(subject.policyVersion === draftPolicy.version && subject.policy_digest === policyDigest, "SCOPE_OR_POLICY_MISMATCH");
    const checked = validateAnswerCandidate(pkg.candidate, context.candidateContext);
    requireValue(checked.status === "VALID_CANDIDATE", `CANDIDATE_${checked.code}`);
    requireValue(pkg.context_sha256 === contextHash(context), "CANDIDATE_CONTEXT_MISMATCH");
    requireValue(Date.parse(pkg.candidate.provenance.completed_at) <= now, "FUTURE_CANDIDATE");
    // Supplemental legacy gate: the substituted SAFE_STUB is never returned or released.
    const input = context.candidateContext.inputDecision;
    requireValue(input.ok && assertAdmissible({ ...input, response: { type: "SAFE_STUB", text: pkg.candidate.answer.text } }).ok,
      "CANDIDATE_OUTPUT_REFUSED");

    const receipts = context.evidenceReceipts;
    requireValue(Array.isArray(receipts) && unique(receipts.map(receipt => receipt.source_id)), "INVALID_SOURCE_RECEIPTS");
    requireValue(unique(pkg.sources.map(source => source.source_id)), "DUPLICATE_SOURCE");
    const refs = pkg.candidate.evidence.source_refs;
    requireValue(refs.length === pkg.sources.length && receipts.length === pkg.sources.length &&
      context.candidateContext.sourceReceipts.length === pkg.sources.length, "SOURCE_SET_MISMATCH");
    for (const source of pkg.sources) {
      const { text, ...receipt } = source;
      const trusted = receipts.find(item => item.source_id === source.source_id);
      requireValue(trusted && hashPolicyJson(receipt) === hashPolicyJson(trusted), "SOURCE_RECEIPT_MISMATCH");
      requireValue(source.organization === subject.organization && source.domain === subject.domain, "SOURCE_SCOPE_MISMATCH");
      requireValue(Date.parse(source.captured_at) <= now, "FUTURE_SOURCE");
      requireValue(hashAnswerText(text) === source.content_sha256 && refs.some(ref =>
        ref.source_id === source.source_id && ref.content_sha256 === source.content_sha256), "SOURCE_CONTENT_MISMATCH");
    }

    requireValue(unique(pkg.claims.map(claim => claim.id)), "DUPLICATE_CLAIM");
    const answer = Array.from(pkg.candidate.answer.text);
    const covered = new Set<number>(), usedSources = new Set<string>();
    for (const claim of pkg.claims) {
      requireValue(claim.start < claim.end && claim.end <= answer.length &&
        /\S/u.test(answer.slice(claim.start, claim.end).join("")), "INVALID_CLAIM_SPAN");
      for (let offset = claim.start; offset < claim.end; offset++) {
        requireValue(!covered.has(offset), "OVERLAPPING_CLAIMS"); covered.add(offset);
      }
      requireValue(unique(claim.support.map(item => hashPolicyJson(item))), "DUPLICATE_SUPPORT");
      for (const support of claim.support) {
        const source = pkg.sources.find(item => item.source_id === support.source_id);
        requireValue(source, "UNKNOWN_SUPPORT_SOURCE");
        const content = Array.from(source!.text);
        requireValue(support.start < support.end && support.end <= content.length &&
          /\S/u.test(content.slice(support.start, support.end).join("")), "INVALID_SUPPORT_SPAN");
        usedSources.add(support.source_id);
      }
    }
    requireValue(answer.every((character, offset) => !/\S/u.test(character) || covered.has(offset)), "UNCOVERED_ANSWER_TEXT");
    requireValue(usedSources.size === pkg.sources.length, "UNUSED_SOURCE");
    return { ok: true, package: pkg };
  } catch (error) { return { ok: false, reason: error instanceof Invalid ? error.message : "INVALID_CANDIDATE_REVIEW_CONTEXT" }; }
}

/** Produces an internal review artifact, not a public answer. Caller must protect the returned content. */
export function prepareCandidateReview(candidate: unknown, context: CandidateReviewContext,
  scope: Omit<ScopedSubject, "candidate">, sources: EvidenceSource[], claims: EvidenceClaim[], now: number) {
  try {
    const subject: ScopedSubject = jsonCopy({ ...scope, candidate: {
      schema_version: "skillspring.candidate-review-package.draft.v1", requirements: "sourced-informational-review-v1",
      candidate, context_sha256: contextHash(context), sources, claims
    } });
    const checked = validateCandidateReviewSubject(subject, context, now);
    if (!checked.ok) return { ...checked, status: "SIMULATION_ONLY" as const, release_authorized: false as const };
    return { ok: true as const, status: "SIMULATION_ONLY" as const, subject, subject_hash: hashPolicyJson(subject),
      release_authorized: false as const };
  } catch { return { ok: false as const, status: "SIMULATION_ONLY" as const, reason: "INVALID_CANDIDATE_REVIEW_CONTEXT", release_authorized: false as const }; }
}

/** Bind signed attestations to this exact package. Uncertainty may be recorded but never qualifies as approval. */
export function assessmentBindingReason(pkg: CandidateReviewPackage, record: ReviewRecord): string | null {
  const assessment = record.candidateAssessment;
  if (!validAssessment(assessment)) return "SIGNED_CANDIDATE_ASSESSMENT_REQUIRED";
  if (assessment.package_sha256 !== hashPolicyJson(pkg) || assessment.answer_sha256 !== pkg.candidate.provenance.answer_sha256) {
    return "ASSESSMENT_BINDING_MISMATCH";
  }
  if (record.reviewedAt < Math.max(Date.parse(pkg.candidate.provenance.completed_at), ...pkg.sources.map(source => Date.parse(source.captured_at)))) {
    return "ASSESSMENT_PREDATES_CONTENT";
  }
  if (!unique(assessment.claim_checks.map(check => check.claim_id)) ||
    assessment.claim_checks.some(check => !pkg.claims.some(claim => claim.id === check.claim_id))) return "ASSESSMENT_CLAIM_MISMATCH";
  return null;
}
export function assessmentComplete(pkg: CandidateReviewPackage, record: ReviewRecord): boolean {
  if (assessmentBindingReason(pkg, record)) return false;
  const assessment = record.candidateAssessment!;
  return record.decision === "APPROVE" && record.evidence === "VERIFIED" && record.authorityClaims === "CLEARED" &&
    record.outputChecks === "PASS" && assessment.coverage === "COMPLETE" && assessment.authority_claims === "CLEARED" &&
    assessment.output_admissibility === "PASS" && assessment.claim_checks.length === pkg.claims.length &&
    assessment.claim_checks.every(check => check.finding === "SUPPORTED");
}
