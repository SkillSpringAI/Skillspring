import { evaluateV1 } from "../../runtime/api/evaluate.js";
import { hashAnswerText, validateAnswerCandidate, type GeneratedAnswerCandidateV1 } from "../../runtime/answers/candidate.js";
import { BEDROCK_PROFILE, BEDROCK_REGION, type generateBedrock } from "./client.js";
import { integrationCases, probeCandidate } from "./integration.js";

type Generation = Awaited<ReturnType<typeof generateBedrock>>;

/** Receives a trusted adapter result. No metadata is read from generated text. */
export async function runCandidateCase(test: typeof integrationCases[number], provider: (prompt: string) => Promise<Generation>) {
  const evaluated = await evaluateV1({ schema_version: "skillspring.evaluate.request.v1", user_input: test.prompt });
  if (!evaluated.result || evaluated.result.policy.decision !== test.expected) throw new Error("CANDIDATE_INPUT_MISMATCH");
  const input = evaluated.result;
  const common = {
    case_id: test.id, input_decision: input.policy.decision,
    governance_manifest_id: input.policy.governance_manifest_id, generated_answer_authorized: false
  };
  if (!input.ok) return { ...common, provider_called: false, outcome: "INPUT_REFUSED" };
  let result: Generation;
  try { result = await provider(test.prompt); }
  catch { return { ...common, provider_called: true, outcome: "PROVIDER_FAILED" }; }
  if (result.stopReason !== "end_turn") return { ...common, provider_called: true, outcome: "INCOMPLETE_OUTPUT" };
  const receipt = result.invocation;
  if (!receipt || receipt.prompt_sha256 !== hashAnswerText(test.prompt) ||
      receipt.provider !== "AWS_BEDROCK" || receipt.source_region !== BEDROCK_REGION ||
      receipt.inference_profile_id !== BEDROCK_PROFILE || receipt.stop_reason !== "end_turn") {
    return { ...common, provider_called: true, outcome: "INVOCATION_MISMATCH" };
  }
  const invocation = { ...receipt, stop_reason: "end_turn" as const };
  const candidate: GeneratedAnswerCandidateV1 = {
    schema_version: "skillspring.generated-answer-candidate.v1", kind: "GENERATED_ANSWER_CANDIDATE",
    trace_id: input.trace_id, governance_manifest_id: input.policy.governance_manifest_id,
    provenance: { ...invocation }, answer: { text: result.text, purpose: "INFORMATIONAL_DRAFT" },
    evidence: { verification: "UNVERIFIED", source_refs: [] },
    review: { authority_claims: "PENDING", output_admissibility: "PENDING" }, release_authorized: false
  };
  const check = validateAnswerCandidate(candidate, { inputDecision: input, invocation, sourceReceipts: [] });
  if (check.status !== "VALID_CANDIDATE") {
    return { ...common, provider_called: true, outcome: "CANDIDATE_REJECTED", candidate_check: check };
  }
  // Supplemental legacy probe; it cannot complete either pending review.
  const outputProbe = probeCandidate(input, result.text);
  return {
    ...common, provider_called: true, outcome: outputProbe.ok ? "CANDIDATE_REVIEW_REQUIRED" : "OUTPUT_REFUSED",
    candidate_check: check, invocation, evidence_verification: candidate.evidence.verification,
    review: candidate.review,
    output_refusal_code: outputProbe.ok ? undefined : outputProbe.refusal.code
  };
}
