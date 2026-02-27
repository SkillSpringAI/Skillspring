import { assertAdmissible } from "../runtime/outputGate";
import type { PipelineOutput } from "../runtime/types";

function must(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

export async function run() {
  const input: PipelineOutput = {
    ok: true,
    mode: "DEFAULT",
    mode_reason: "DEFAULT_SAFE",
    trace_id: "TEST_ALLOW_PRESERVATION",
    policy: {
      decision: "ALLOW",
      decision_code: "ALLOW_SAFE",
      mode_reason: "DEFAULT_SAFE",
      dataset_versions: { dual_use: "v-test", reconstruction: "v-test" },
      trigger_hits: [],
      evidence_status: "UNKNOWN"
    },
    evidence: [
      { item: "Synthetic evidence for allow-preservation DIAG.", status: "UNKNOWN" }
    ],
    response: {
      type: "SAFE_STUB",
      text: "This is a harmless response."
    }
  };

  const out = assertAdmissible(input);

  if (out.ok !== true) {
    const r: any = (out as any).refusal;
    const details = r ? `downgraded_to=${r.code} msg=${String(r.message).slice(0, 220)}` : "downgraded_no_refusal";
    throw new Error(`allow-preservation: ok:true output was downgraded (${details})`);
  }

  must(!("refusal" in out), "allow-preservation: refusal object unexpectedly added");
  return { ok: true };
}
