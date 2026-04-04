import type { ModeReasonCode, PolicyBlock, PolicyEvidenceStatus, TriggerHit } from "./types.js";

const DATASET_VERSION_NOTE = "datasets: dual-use=v1; reconstruction=v1";

function parseDatasetVersions(note: string): { dual_use: string; reconstruction: string } {
  const du = /dual-use=([^\s;,\)]+)/i.exec(note)?.[1] ?? "UNKNOWN";
  const rc = /reconstruction=([^\s;,\)]+)/i.exec(note)?.[1] ?? "UNKNOWN";
  return { dual_use: du, reconstruction: rc };
}

function evidenceStatusFrom(evidence: Array<{ item: string; status: string }>): PolicyEvidenceStatus {
  const anyUnknown = evidence.some((e) => e.status === "UNKNOWN");
  return anyUnknown ? "UNKNOWN" : "KNOWN";
}

export function makePolicy(
  decision: "ALLOW" | "REFUSE",
  decision_code: string,
  mode_reason: ModeReasonCode,
  evidence?: Array<{ item: string; status: string }>,
  trigger_hits?: readonly TriggerHit[]
): PolicyBlock {
  const dv = parseDatasetVersions(DATASET_VERSION_NOTE);

  const policy: PolicyBlock = {
    decision,
    decision_code,
    mode_reason,
    dataset_versions: {
      dual_use: dv.dual_use,
      reconstruction: dv.reconstruction
    },
    trigger_hits: trigger_hits ? [...trigger_hits] : [],
    evidence_status: evidence ? evidenceStatusFrom(evidence) : "UNKNOWN"
  };

  return Object.freeze(policy) as PolicyBlock;
}
