import type { PipelineInput, PipelineOutput } from "./types.js";
import { classify, makeTraceId } from "./controlPlane.js";
import { executeStub } from "./executionPlane.js";
import { assertAdmissible } from "./outputGate.js";

const DATASET_VERSION_NOTE = "datasets: dual-use=v1; reconstruction=v1";

export async function runGovernedPipeline(
  input: PipelineInput
): Promise<PipelineOutput> {
  if (!input || typeof input.user_input !== "string" || input.user_input.trim() === "") {
    return assertAdmissible({
      ok: false,
      mode: "GOVERNANCE",
      trace_id: "NO_TRACE_ID",
      refusal: {
        code: "REFUSE-INVALID-INPUT",
        message: "Invalid or missing user_input. (" + DATASET_VERSION_NOTE + ")"
      }
    });
  }

  const trace_id = makeTraceId(input.user_input);
  const ctx = classify(input);
  const mode_reason_note = `mode_reason=${ctx.mode_reason}`;

  // Hard refusal triggers (fail-closed)
  if (ctx.risk.dual_use || ctx.risk.reconstruction_risk) {
    return assertAdmissible({
      ok: false,
      mode: ctx.mode,
      trace_id,
      refusal: {
        code: "REFUSE-DUALUSE-OR-RECONSTRUCTION",
        message:
          `Request appears dual-use or reconstruction-risk. Refusing under governance policy. (${DATASET_VERSION_NOTE}; ${mode_reason_note})`
      }
    });
  }

  // Control → Execution handshake (stub)
  const exec = await executeStub(ctx);

  const out: PipelineOutput = {
    ok: true,
    mode: ctx.mode,
    trace_id,
    evidence: [
      { item: "User input content", status: "PROVIDED" },
      { item: "Jurisdiction", status: "UNKNOWN" },
      { item: "Domain classification", status: "ASSUMED" },
      { item: `Mode reason (${mode_reason_note})`, status: "ASSUMED" },
      { item: `Dataset versions (${DATASET_VERSION_NOTE})`, status: "PROVIDED" }
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
