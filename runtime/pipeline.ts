import type { PipelineInput, PipelineOutput } from "./types.ts";
import { classify, makeTraceId } from "./controlPlane.ts";
import { executeStub } from "./executionPlane.ts";
import { assertAdmissible } from "./outputGate.ts";

export async function runGovernedPipeline(
  input: PipelineInput
): Promise<PipelineOutput> {
  const trace_id = makeTraceId(input.user_input);

  const ctx = classify(input);

  // Hard refusal triggers (fail-closed)
  if (ctx.risk.dual_use || ctx.risk.reconstruction_risk) {
    return assertAdmissible({
      ok: false,
      mode: ctx.mode,
      trace_id,
      refusal: {
        code: "REFUSE-DUALUSE-OR-RECONSTRUCTION",
        message:
          "Request appears dual-use or reconstruction-risk. Refusing under governance policy."
      }
    });
  }

  // Control → Execution handshake (stub)
  const exec = await executeStub(ctx);

  // Safe, non-capability output
  const out: PipelineOutput = {
    ok: true,
    mode: ctx.mode,
    trace_id,
    evidence: [
      { item: "User input content", status: "PROVIDED" },
      { item: "Jurisdiction", status: "UNKNOWN" },
      { item: "Domain classification", status: "ASSUMED" }
    ],
    response: {
      type: "SAFE_STUB",
      text:
        `Governance pipeline OK. ${exec.note}\n` +
        `No agentic execution is implemented by design.`
    }
  };

  return assertAdmissible(out);
}

