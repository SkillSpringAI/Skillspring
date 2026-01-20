/**
 * Diagnostic: Pipeline Fail-Closed Guarantees (current contract)
 * Purpose:
 * 1) Malformed inputs must refuse (fail-closed).
 * 2) Safe input may succeed (stub allowed).
 * 3) Reconstruction/dual-use triggers must refuse (fail-closed).
 */

import { readFileSync } from "node:fs";
import { classify } from "../runtime/controlPlane";
import { runGovernedPipeline } from "../runtime/pipeline";
import type { PipelineInput } from "../runtime/types";

function loadReconPatterns(): string[] {
  const obj = JSON.parse(readFileSync("datasets/risk-patterns/reconstruction-vectors.json", "utf8"));
  if (!Array.isArray(obj.patterns) || obj.patterns.length === 0) {
    throw new Error("Pipeline diag failed: reconstruction-vectors.json has no patterns.");
  }
  return obj.patterns;
}

function pickReconTrigger(): string {
  const patterns = loadReconPatterns();
  const hit = patterns.find((p) => classify({ user_input: p } as any).risk.reconstruction_risk);
  if (!hit) {
    throw new Error(
      "Pipeline diag failed: no reconstruction pattern triggers risk.reconstruction_risk in classify(). " +
        "Update reconstruction-vectors.json patterns or classifier logic."
    );
  }
  return hit;
}

export async function pipelineFailClosedDiagnostics(): Promise<void> {
  // 1) Malformed input must refuse (fail-closed)
  const bad1 = await runGovernedPipeline({} as any);
  if (bad1.ok !== false || !bad1.refusal?.code) {
    throw new Error("Pipeline failed: malformed input did not refuse with an admissible envelope.");
  }

  const bad2 = await runGovernedPipeline({ user_input: "" } as any);
  if (bad2.ok !== false || !bad2.refusal?.code) {
    throw new Error("Pipeline failed: empty user_input did not refuse.");
  }

  // 2) Safe input should succeed (stub success is allowed by current design)
  const base: PipelineInput = {
    user_input: "hello",
    meta: { source: "diag", timestamp_utc: new Date().toISOString() }
  };

  const safe = await runGovernedPipeline(base);
  if (safe.ok !== true) {
    throw new Error("Pipeline failed: safe input did not return ok:true.");
  }
  if (!safe.trace_id || !safe.mode) {
    throw new Error("Pipeline failed: missing trace_id or mode.");
  }

  // 3) Reconstruction-risk must refuse (fail-closed)
  const reconPrompt = pickReconTrigger();
  const recon = await runGovernedPipeline({ ...base, user_input: reconPrompt });

  if (recon.ok !== false) {
    throw new Error(`Pipeline failed: reconstruction-risk did not refuse for trigger: "${reconPrompt}"`);
  }
  if (!recon.refusal?.code) {
    throw new Error("Pipeline failed: refusal missing code.");
  }
}
