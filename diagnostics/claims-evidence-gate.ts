import { evaluateClaimsEvidence } from "../runtime/claimsEvidenceGate.js";

function must(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

export async function run() {
  const empty = evaluateClaimsEvidence("");
  must(Array.isArray(empty.evidence), "claims-evidence-gate: empty result missing evidence array");
  must(empty.evidence.length > 0, "claims-evidence-gate: empty result has no evidence items");
  must(empty.evidence[0].status === "UNKNOWN", "claims-evidence-gate: empty input should classify as UNKNOWN");

  const nonEmpty = evaluateClaimsEvidence("hello world");
  must(Array.isArray(nonEmpty.evidence), "claims-evidence-gate: non-empty result missing evidence array");
  must(nonEmpty.evidence.length > 0, "claims-evidence-gate: non-empty result has no evidence items");
  must(nonEmpty.evidence[0].status === "PROVIDED", "claims-evidence-gate: non-empty input should classify as PROVIDED");

  return {
    ok: true,
    empty_status: empty.evidence[0].status,
    non_empty_status: nonEmpty.evidence[0].status
  };
}
