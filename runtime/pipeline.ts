import type { PipelineInput, PipelineOutput } from "./types";
import { classify, makeTraceId } from "./controlPlane";
import { executeStub } from "./executionPlane";
import { assertAdmissible } from "./outputGate";

function validatePipelineInput(input: any): { ok: true } | { ok: false; code: string; message: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, code: "REFUSE-INVALID-INPUT", message: "PipelineInput must be an object." };
  }

  if (typeof input.user_input !== "string" || input.user_input.trim().length === 0) {
    return {
      ok: false,
      code: "REFUSE-INVALID-INPUT",
      message: "PipelineInput.user_input must be a non-empty string."
    };
  }

  // meta is optional, but if present must be an object
  if ("meta" in input && input.meta !== undefined && (typeof input.meta !== "object" || input.meta === null)) {
    return { ok: false, code: "REFUSE-INVALID-INPUT", message: "PipelineInput.meta must be an object if provided." };
  }

  // meta fields are optional but must be strings if provided
  if (input.meta?.source !== undefined && typeof input.meta.source !== "string") {
    return { ok: false, code: "REFUSE-INVALID-INPUT", message: "PipelineInput.meta.source must be a string if provided." };
  }
  if (input.meta?.timestamp_utc !== undefined && typeof input.meta.timestamp_utc !== "string") {
    return {
      ok: false,
      code: "REFUSE-INVALID-INPUT",
      message: "PipelineInput.meta.timestamp_utc must be a string if provided."
    };
  }

  return { ok: true };
}

export async function runGovernedPipeline(input: PipelineInput): Promise<PipelineOutput> {
  // Fail-closed input validation (no silent defaults)
  const v = validatePipelineInput(input as any);
  const trace_id = makeTraceId((input as any)?.user_input ?? "");

  if (!v.ok) {
    return assertAdmissible({
      ok: false,
      mode: "GOVERNANCE",
      trace_id,
      refusal: {
        code: v.code,
        message: v.message
      }
    });
  }

  const ctx = classify(input);

  // Hard refusal triggers (fail-closed)
  if (ctx.risk.dual_use || ctx.risk.reconstruction_risk) {
    return assertAdmissible({
      ok: false,
      mode: ctx.mode,
      trace_id,
      refusal: {
        code: "REFUSE-DUALUSE-OR-RECONSTRUCTION",
        message: "Request appears dual-use or reconstruction-risk. Refusing under governance policy."
      }
    });
  }

  // Control -> Execution handshake (stub)
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
      text: `Governance pipeline OK. ${exec.note}\nNo agentic execution is implemented by design.`
    }
  };

  return assertAdmissible(out);
}
