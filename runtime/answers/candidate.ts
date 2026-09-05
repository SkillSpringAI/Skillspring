import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import schema from "../../schemas/outputs/generated-answer-candidate.v1.schema.json";
import { governanceManifest } from "../governance.js";
import type { PipelineOutput } from "../types.js";

export type AnswerProvenance = {
  provider: "AWS_BEDROCK";
  source_region: string;
  inference_profile_id: string;
  request_id: string;
  completed_at: string;
  stop_reason: "end_turn";
  prompt_sha256: string;
  answer_sha256: string;
};
export type SourceReference = { source_id: string; content_sha256: string };
export type GeneratedAnswerCandidateV1 = {
  schema_version: "skillspring.generated-answer-candidate.v1";
  kind: "GENERATED_ANSWER_CANDIDATE";
  trace_id: string;
  governance_manifest_id: string;
  provenance: AnswerProvenance;
  answer: { text: string; purpose: "INFORMATIONAL_DRAFT" };
  evidence: { verification: "UNVERIFIED"; source_refs: SourceReference[] };
  review: { authority_claims: "PENDING"; output_admissibility: "PENDING" };
  release_authorized: false;
};

/** Context supplied by a trusted invocation controller, never by model text or HTTP callers. */
export type CandidateContext = {
  inputDecision: PipelineOutput;
  invocation: AnswerProvenance;
  sourceReceipts: readonly SourceReference[];
};
export type CandidateCheck = {
  status: "VALID_CANDIDATE" | "REJECTED";
  code: "REVIEW_REQUIRED" | "INVALID_CONTRACT" | "INPUT_NOT_ALLOWED" | "BINDING_MISMATCH" |
    "PROVENANCE_MISMATCH" | "ANSWER_HASH_MISMATCH" | "EVIDENCE_MISMATCH";
  release_authorized: false;
};

const ajv = new Ajv({ strict: true, ownProperties: true });
addFormats(ajv);
const validate = ajv.compile<GeneratedAnswerCandidateV1>(schema);

export function hashAnswerText(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

/** Contract validity never authorizes answer release. No candidate text is returned. */
export function validateAnswerCandidate(candidate: unknown, context: CandidateContext): CandidateCheck {
  const reject = (code: CandidateCheck["code"]): CandidateCheck => ({ status: "REJECTED", code, release_authorized: false });
  try {
    if (!validate(candidate)) return reject("INVALID_CONTRACT");
    if (!context.inputDecision.ok || context.inputDecision.policy.decision !== "ALLOW") return reject("INPUT_NOT_ALLOWED");
    if (candidate.trace_id !== context.inputDecision.trace_id ||
        candidate.governance_manifest_id !== context.inputDecision.policy.governance_manifest_id ||
        candidate.governance_manifest_id !== governanceManifest.manifest_id) return reject("BINDING_MISMATCH");
    for (const key of Object.keys(candidate.provenance) as (keyof AnswerProvenance)[]) {
      if (candidate.provenance[key] !== context.invocation[key]) return reject("PROVENANCE_MISMATCH");
    }
    if (candidate.provenance.answer_sha256 !== hashAnswerText(candidate.answer.text)) return reject("ANSWER_HASH_MISMATCH");
    const receipts = new Map<string, string>();
    for (const source of context.sourceReceipts) {
      if (receipts.has(source.source_id)) return reject("EVIDENCE_MISMATCH");
      receipts.set(source.source_id, source.content_sha256);
    }
    const seen = new Set<string>();
    for (const source of candidate.evidence.source_refs) {
      if (seen.has(source.source_id) || receipts.get(source.source_id) !== source.content_sha256) return reject("EVIDENCE_MISMATCH");
      seen.add(source.source_id);
    }
    return { status: "VALID_CANDIDATE", code: "REVIEW_REQUIRED", release_authorized: false };
  } catch { return reject("INVALID_CONTRACT"); }
}
