import { readFileSync } from "node:fs";
import { classify } from "../runtime/controlPlane";
import { runGovernedPipeline } from "../runtime/pipeline";
import type { PipelineInput, PipelineOutput } from "../runtime/types";

function must(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

function loadReconPatterns(): string[] {
  const obj = JSON.parse(readFileSync("datasets/risk-patterns/reconstruction-vectors.json", "utf8"));
  must(Array.isArray(obj.patterns) && obj.patterns.length > 0, "output-invariants: missing reconstruction patterns");
  return obj.patterns;
}

function pickReconTrigger(): string {
  const patterns = loadReconPatterns();
  const hit = patterns.find((p) => classify({ user_input: p } as any).risk.reconstruction_risk);
  must(!!hit, "output-invariants: no reconstruction pattern triggers classify().risk.reconstruction_risk");
  return hit!;
}

function assertCommon(out: PipelineOutput, label: string) {
  must(typeof out.trace_id === "string" && out.trace_id.length > 0, `${label}: missing trace_id`);
  must(typeof out.mode === "string" && out.mode.length > 0, `${label}: missing mode`);
}

function assertSuccess(out: PipelineOutput, label: string) {
  must(out.ok === true, `${label}: expected ok:true`);
  // TS narrowing occurs after the check above
  const o = out as Extract<PipelineOutput, { ok: true }>;
  must(Array.isArray(o.evidence) && o.evidence.length > 0, `${label}: ok:true must include non-empty evidence`);
  must(typeof o.response?.text === "string" && o.response.text.length > 0, `${label}: ok:true missing response text`);
}

function assertRefusal(out: PipelineOutput, label: string) {
  must(out.ok === false, `${label}: expected ok:false`);
  const o = out as Extract<PipelineOutput, { ok: false }>;
  must(typeof o.refusal?.code === "string" && o.refusal.code.length > 0, `${label}: refusal missing code`);
  must(typeof o.refusal?.message === "string" && o.refusal.message.length > 0, `${label}: refusal missing message`);
}

export async function checkOutputInvariants(): Promise<void> {
  const base: PipelineInput = {
    user_input: "hello",
    meta: { source: "diag", timestamp_utc: new Date().toISOString() }
  };

  const safe = await runGovernedPipeline(base);
  assertCommon(safe, "output-invariants safe");
  if (safe.ok) assertSuccess(safe, "output-invariants safe");
  else assertRefusal(safe, "output-invariants safe");

  const reconPrompt = pickReconTrigger();
  const refused = await runGovernedPipeline({ ...base, user_input: reconPrompt });

  assertCommon(refused, "output-invariants refused");
  assertRefusal(refused, "output-invariants refused");

  console.log("DIAG output-invariants: PASS");
}
