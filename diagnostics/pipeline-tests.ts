/**
 * Diagnostic: Pipeline Fail-Closed Guarantees (current contract)
 * Purpose:
 * 1) Malformed inputs must refuse (fail-closed).
 * 2) Safe input must return an admissible envelope (ok:true OR ok:false).
 * 3) Reconstruction/dual-use triggers must refuse (fail-closed).
 */

import { readFileSync } from "node:fs";
import { classify } from "../runtime/controlPlane";
import { runGovernedPipeline } from "../runtime/pipeline";
import type { PipelineInput, PipelineOutput } from "../runtime/types";

function must(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

function loadReconPatterns(): string[] {
  const obj = JSON.parse(readFileSync("datasets/risk-patterns/reconstruction-vectors.json", "utf8"));
  must(Array.isArray(obj.patterns) && obj.patterns.length > 0, "pipeline-tests: reconstruction-vectors.json has no patterns.");
  return obj.patterns;
}

function pickReconTrigger(): string {
  const patterns = loadReconPatterns();
  const hit = patterns.find((p) => classify({ user_input: p } as any).risk.reconstruction_risk);
  must(!!hit, "pipeline-tests: no reconstruction pattern triggers classify().risk.reconstruction_risk");
  return hit!;
}

function assertAdmissibleEnvelope(out: PipelineOutput, label: string) {
  must(typeof out.trace_id === "string" && out.trace_id.length > 0, `${label}: missing trace_id`);
  must(typeof out.mode === "string" && out.mode.length > 0, `${label}: missing mode`);

  if (out.ok === true) {
    must(Array.isArray(out.evidence) && out.evidence.length > 0, `${label}: ok:true must include evidence`);
    must(typeof out.response?.text === "string" && out.response.text.length > 0, `${label}: ok:true missing response text`);
  } else {
    must(typeof out.refusal?.code === "string" && out.refusal.code.length > 0, `${label}: refusal missing code`);
    must(typeof out.refusal?.message === "string" && out.refusal.message.length > 0, `${label}: refusal missing message`);
  }
}

export async function pipelineFailClosedDiagnostics(): Promise<void> {
  // 1) Malformed input must refuse (fail-closed)
  const bad1 = await runGovernedPipeline({} as any);
  must(bad1.ok === false && !!bad1.refusal?.code, "Pipeline failed: malformed input did not refuse with an admissible envelope.");

  const bad2 = await runGovernedPipeline({ user_input: "" } as any);
  must(bad2.ok === false && !!bad2.refusal?.code, "Pipeline failed: empty user_input did not refuse.");

  // 2) Safe input must return an admissible envelope (success OR refusal)
  const base: PipelineInput = {
    user_input: "hello",
    meta: { source: "diag", timestamp_utc: new Date().toISOString() }
  };

  const safe = await runGovernedPipeline(base);
  assertAdmissibleEnvelope(safe, "Pipeline safe");

  // 3) Reconstruction-risk must refuse (fail-closed)
  const reconPrompt = pickReconTrigger();
  const recon = await runGovernedPipeline({ ...base, user_input: reconPrompt });

  must(recon.ok === false, `Pipeline failed: reconstruction-risk did not refuse for trigger: "${reconPrompt}"`);
  assertAdmissibleEnvelope(recon, "Pipeline recon");
}
