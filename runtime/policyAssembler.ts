import type { ModeReasonCode, PolicyBlock, PolicyEvidenceStatus, TriggerHit } from "./types.js";
import { datasetVersions, governanceManifest } from "./governance.js";

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
  const dv = datasetVersions();

  const policy: PolicyBlock = {
    decision,
    decision_code,
    governance_manifest_id: governanceManifest.manifest_id,
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
