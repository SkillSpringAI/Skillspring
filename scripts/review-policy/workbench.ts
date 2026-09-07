import Ajv from "ajv";
import { join } from "node:path";
import { makeCandidateReviewFixture } from "./workbench-fixture.js";
import { SqlitePolicyHistoryStore } from "./history-store.js";
import { DurablePolicySimulation, policyTrustDigest } from "./durable-boundary.js";
import { prepareCandidateReview, type CandidateReviewPackage } from "./candidate-review.js";
import { hashPolicyJson, type AccessMode, type CandidateAssessment, type ReviewRecord } from "./simulate.js";

export const workbenchModes = ["DEFAULT", "GOVERNANCE", "ARCHITECT"] as const;
type Submission = {
  mode: AccessMode; reviewer: string; subject_hash: string; expected_revision: number;
  decision: "APPROVE" | "REJECT"; claim_checks: CandidateAssessment["claim_checks"];
  authority_claims: CandidateAssessment["authority_claims"];
  output_admissibility: CandidateAssessment["output_admissibility"];
};
const validate = new Ajv({ strict: true, ownProperties: true }).compile<Submission>({
  type: "object", additionalProperties: false,
  required: ["mode", "reviewer", "subject_hash", "expected_revision", "decision", "claim_checks", "authority_claims", "output_admissibility"],
  properties: {
    mode: { enum: workbenchModes }, reviewer: { type: "string", maxLength: 32 },
    subject_hash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
    expected_revision: { type: "integer", minimum: 0, maximum: 10000 },
    decision: { enum: ["APPROVE", "REJECT"] },
    authority_claims: { enum: ["CLEARED", "REJECTED", "UNCERTAIN"] },
    output_admissibility: { enum: ["PASS", "FAIL", "UNCERTAIN"] },
    claim_checks: { type: "array", minItems: 1, maxItems: 64, items: {
      type: "object", additionalProperties: false, required: ["claim_id", "finding"],
      properties: { claim_id: { type: "string", maxLength: 128 }, finding: { enum: ["SUPPORTED", "UNSUPPORTED", "UNCERTAIN"] } }
    } }
  }
});
export class WorkbenchError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

/** Synthetic-only local adapter. Signing closures and trust inputs stay server-side. */
export async function createWorkbench(root: string) {
  const sessions = new Map<AccessMode, Awaited<ReturnType<typeof createSession>>>();
  try {
    for (const mode of workbenchModes) sessions.set(mode, await createSession(root, mode));
  } catch (error) { for (const session of sessions.values()) session.close(); throw error; }
  function session(mode: string) {
    const found = sessions.get(mode as AccessMode);
    if (!found) throw new WorkbenchError(400, "INVALID_MODE");
    return found;
  }
  return {
    state: (mode: string) => session(mode).state(),
    submit(input: unknown) {
      if (!validate(input)) throw new WorkbenchError(400, "INVALID_ASSESSMENT");
      return session(input.mode).submit(input);
    },
    close() { for (const value of sessions.values()) value.close(); }
  };
}

async function createSession(root: string, mode: AccessMode) {
  const sentences = ["Governance assigns responsibility.", "Reviews remain advisory."];
  const fixture = await makeCandidateReviewFixture(mode, sentences.join(" "));
  const firstEnd = Array.from(sentences[0]).length;
  const claims = sentences.map((_text, index) => ({ id: `claim-${index + 1}`,
    start: index === 0 ? 0 : firstEnd + 1,
    end: index === 0 ? firstEnd : Array.from(fixture.candidate.answer.text).length,
    support: [{ source_id: fixture.source.source_id, start: index === 0 ? 0 : firstEnd + 1,
      end: index === 0 ? firstEnd : Array.from(fixture.source.text).length }]
  }));
  const prepared = prepareCandidateReview(fixture.candidate, fixture.context, fixture.scope, [fixture.source], claims, fixture.now);
  if (!prepared.ok) throw new Error(prepared.reason);
  const subject = prepared.subject, pkg = subject.candidate as CandidateReviewPackage;
  const store = SqlitePolicyHistoryStore.create(join(root, `${mode}.sqlite`), "team-a", policyTrustDigest(fixture.keys));
  const simulation = new DurablePolicySimulation(store, fixture.keys);
  const records = () => store.transaction(history => history.flatMap(event =>
    event.type === "artifact" && event.artifact.kind === "review" ? [{
      revision: event.artifact.revision, record: event.artifact.payload as ReviewRecord
    }] : []));
  const state = () => {
    const result = simulation.checkCandidateReview(subject, fixture.context, fixture.signedSnapshot(), fixture.now);
    if (result.reason === "STORE_UNAVAILABLE_OR_CORRUPT") throw new WorkbenchError(503, result.reason);
    return {
      schema_version: "skillspring.workbench.v1", synthetic: true, release_authorized: false,
      mode, subject_hash: prepared.subject_hash, clock: new Date(fixture.now).toISOString(),
      scope: fixture.scope, package: pkg, required_reviewers: fixture.requiredReviewers,
      history: records(), result
    };
  };
  return {
    state,
    submit(input: Submission) {
      if (!fixture.requiredReviewers.includes(input.reviewer)) throw new WorkbenchError(400, "INVALID_TEST_REVIEWER");
      if (input.subject_hash !== prepared.subject_hash) throw new WorkbenchError(409, "SUBJECT_CHANGED");
      if (input.claim_checks.length !== claims.length || new Set(input.claim_checks.map(c => c.claim_id)).size !== claims.length ||
          input.claim_checks.some(check => !claims.some(claim => claim.id === check.claim_id))) {
        throw new WorkbenchError(400, "CLAIM_SET_MISMATCH");
      }
      const current = records().filter(item => item.record.reviewer === input.reviewer).at(-1)?.revision ?? 0;
      if (input.expected_revision !== current) throw new WorkbenchError(409, "REVIEW_CHANGED_REFRESH_REQUIRED");
      const assessment: CandidateAssessment = {
        schema_version: "skillspring.candidate-assessment.draft.v1", package_sha256: hashPolicyJson(pkg),
        answer_sha256: pkg.candidate.provenance.answer_sha256, coverage: "COMPLETE",
        claim_checks: input.claim_checks, authority_claims: input.authority_claims, output_admissibility: input.output_admissibility
      };
      const artifact = fixture.signedReview(input.reviewer, {
        decision: input.decision, candidateAssessment: assessment,
        evidence: input.claim_checks.every(check => check.finding === "SUPPORTED") ? "VERIFIED" : "UNVERIFIED",
        authorityClaims: input.authority_claims === "CLEARED" ? "CLEARED" : "PENDING",
        outputChecks: input.output_admissibility === "PASS" ? "PASS" : "FAIL"
      }, current + 1, subject);
      const accepted = simulation.acceptCandidateReview(subject, fixture.context, artifact, fixture.now);
      if (!accepted.accepted) throw new WorkbenchError(422, accepted.reason);
      return state();
    },
    close: () => store.close()
  };
}
