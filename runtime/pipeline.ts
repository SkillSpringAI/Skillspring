import type { PipelineInput, PipelineOutput } from "./types";
import { classify, makeTraceId } from "./controlPlane";
import { executeStub } from "./executionPlane";
import { assertAdmissible } from "./outputGate";
import { readFileSync } from "node:fs";

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

  if ("meta" in input && input.meta !== undefined && (typeof input.meta !== "object" || input.meta === null)) {
    return { ok: false, code: "REFUSE-INVALID-INPUT", message: "PipelineInput.meta must be an object if provided." };
  }

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

function readDatasetVersion(path: string): string {
  try {
    const obj = JSON.parse(readFileSync(path, "utf8"));
    const v = obj?.version;
    return typeof v === "string" && v.trim().length > 0 ? v : "UNKNOWN";
  } catch {
    return "UNREADABLE";
  }
}

function datasetVersionNote(): string {
  const dual = readDatasetVersion("datasets/risk-patterns/dual-use-patterns.json");
  const recon = readDatasetVersion("datasets/risk-patterns/reconstruction-vectors.json");
  return `datasets: dual-use=${dual}; reconstruction=${recon}`;
}

export async function runGovernedPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const v = validatePipelineInput(input as any);
  const trace_id = makeTraceId((input as any)?.user_input ?? "");
  const version_note = datasetVersionNote();

  if (!v.ok) {
    return assertAdmissible({
      ok: false,
      mode: "GOVERNANCE",
      trace_id,
      refusal: {
        code: v.code,
        message: `${v.message} (${version_note})`
      }
    });
  }

  const ctx = classify(input);

  if (ctx.risk.dual_use || ctx.risk.reconstruction_risk) {
    return assertAdmissible({
      ok: false,
      mode: ctx.mode,
      trace_id,
      refusal: {
        code: "REFUSE-DUALUSE-OR-RECONSTRUCTION",
        message: `Request appears dual-use or reconstruction-risk. Refusing under governance policy. (${version_note})`
      }
    });
  }

  const exec = await executeStub(ctx);

  const out: PipelineOutput = {
    ok: true,
    mode: ctx.mode,
    trace_id,
    evidence: [
      { item: "User input content", status: "PROVIDED" },
      { item: "Jurisdiction", status: "UNKNOWN" },
      { item: "Domain classification", status: "ASSUMED" },
      { item: `Dataset versions (${version_note})`, status: "PROVIDED" }
    ],
    response: {
      type: "SAFE_STUB",
      text: `Governance pipeline OK. ${exec.note}\nNo agentic execution is implemented by design.`
    }
  };

  return assertAdmissible(out);
}

