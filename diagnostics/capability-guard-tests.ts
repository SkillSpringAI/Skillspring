import { assertAdmissible } from "../runtime/outputGate";
import type { PipelineOutput } from "../runtime/types";

function must(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

export function checkCapabilityGuard(): void {
  const out: PipelineOutput = {
    ok: true,
    mode: "DEFAULT",
    trace_id: "diag-trace",
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
