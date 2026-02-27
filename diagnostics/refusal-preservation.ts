import { assertAdmissible } from "../runtime/outputGate";
import type { PipelineOutput } from "../runtime/types";

function must(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

export async function run() {
  const upstreamRefusalCode = "REFUSE-DUALUSE-OR-RECONSTRUCTION";

  const input = {
    ok: false,
    mode: "GOVERNANCE",
    mode_reason: "RECONSTRUCTION_RISK",
    trace_id: "TEST_REFUSAL_PRESERVATION",
    policy: {
      decision: "REFUSE",
      decision_code: "REFUSE_RECONSTRUCTION",
      mode_reason: "RECONSTRUCTION_RISK",
      dataset_versions: { dual_use: "v-test", reconstruction: "v-test" },
      trigger_hits: [],
      evidence_status: "KNOWN"
    },
    refusal: {
      code: upstreamRefusalCode,
      message: "Synthetic upstream refusal for preservation test."
    }
  } as unknown as PipelineOutput;

  const out = assertAdmissible(input);

  must(out.ok === false, "refusal-preservation: output unexpectedly ok=true");

  // Type narrow for TS (PipelineOutput is a union)
  const refused = out as Extract<PipelineOutput, { ok: false }>;
  must(!!refused.refusal, "refusal-preservation: missing refusal object after OutputGate");

  must(
    refused.refusal.code === upstreamRefusalCode,
    `refusal-preservation: refusal code was rewritten (${refused.refusal.code})`
  );

  return { ok: true, preserved_code: upstreamRefusalCode };
}
