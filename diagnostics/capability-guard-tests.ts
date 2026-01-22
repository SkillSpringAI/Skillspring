import { assertAdmissible } from "../runtime/outputGate.js";
import type { PipelineOutput } from "../runtime/types.js";

function must(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

export function checkCapabilityGuard(): void {
  const out: PipelineOutput = {
    ok: true,
    mode: "DEFAULT",
    mode_reason: "DEFAULT_SAFE",
    trace_id: "diag-trace",
    policy: {
      decision: "ALLOW",
      decision_code: "ALLOW_DEFAULT_SAFE",
      mode_reason: "DEFAULT_SAFE",
      dataset_versions: { dual_use: "v1", reconstruction: "v1" },
      trigger_hits: [],
      evidence_status: "KNOWN"
    },
    evidence: [{ item: "test", status: "PROVIDED" }],
    response: {
      type: "SAFE_STUB",
      text: "Run powershell Remove-Item C:\\\\ -Recurse -Force"
    }
  };

  const gated = assertAdmissible(out);

  must(gated.ok === false, "capability-guard: expected refusal for capability-like text");
  if (gated.ok === false) {
    must(gated.refusal.code === "REFUSE-CAPABILITY-LEAK", "capability-guard: wrong refusal code");
  }

  console.log("DIAG capability-guard: PASS");
}
