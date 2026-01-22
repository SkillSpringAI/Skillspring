/**
 * Diagnostic: Enforcement Expectations
 * Purpose: Validate that expected failure cases map to enforcement outcomes.
 * This runs the governed pipeline and asserts fail-closed refusal for known risk patterns.
 */

import { readFileSync } from "node:fs";
import { classify } from "../runtime/controlPlane.js";
import { runGovernedPipeline } from "../runtime/pipeline.js";
import type { PipelineInput } from "../runtime/types.js";

function loadPatterns(path: string): string[] {
  const obj = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(obj.patterns) || obj.patterns.length === 0) {
    throw new Error(`Patterns dataset invalid or empty: ${path}`);
  }
  return obj.patterns;
}

export async function checkEnforcementExpectations(): Promise<void> {
  const dualUsePatterns = loadPatterns("datasets/risk-patterns/dual-use-patterns.json");
  const reconPatterns = loadPatterns("datasets/risk-patterns/reconstruction-vectors.json");

  // 1) Classifier must actually flag risk for at least one pattern in each set
  const dualUseHit = dualUsePatterns.find((p) => classify({ user_input: p } as any).risk.dual_use);
  if (!dualUseHit) {
    throw new Error(
      "Enforcement failed: controlPlane.classify did not flag risk.dual_use for any dual-use pattern. " +
      "Update dual-use patterns or classifier logic."
    );
  }

  const reconHit = reconPatterns.find((p) => classify({ user_input: p } as any).risk.reconstruction_risk);
  if (!reconHit) {
    throw new Error(
      "Enforcement failed: controlPlane.classify did not flag risk.reconstruction_risk for any reconstruction pattern. " +
      "Update reconstruction patterns or classifier logic."
    );
  }

  // 2) Governed pipeline must refuse when those flags are true (fail-closed)
  const base: PipelineInput = {
  user_input: "hello",
  meta: { source: "diag", timestamp_utc: new Date().toISOString() }
};

  const refusedDual = await runGovernedPipeline({ ...base, user_input: dualUseHit });
  if (refusedDual.ok !== false || !refusedDual.refusal?.code) {
    throw new Error("Enforcement failed: dual-use hit did not produce refusal envelope.");
  }

  const refusedRecon = await runGovernedPipeline({ ...base, user_input: reconHit });
  if (refusedRecon.ok !== false || !refusedRecon.refusal?.code) {
    throw new Error("Enforcement failed: reconstruction hit did not produce refusal envelope.");
  }

  console.log("DIAG enforcement: PASS");
}

