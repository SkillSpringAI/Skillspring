import { readFileSync } from "node:fs";
import { classify } from "../runtime/controlPlane.js";
import { runGovernedPipeline } from "../runtime/pipeline.js";
import type { PipelineInput, PipelineOutput } from "../runtime/types.js";

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
  must(typeof o.mode_reason === "string" && o.mode_reason.length > 0, `${label}: ok:true missing mode_reason`);
  must(!!(o as any).policy, `${label}: ok:true missing policy`);
  must(Array.isArray((o as any).policy.trigger_hits), `${label}: policy.trigger_hits must be an array`);
  for (const h of (o as any).policy.trigger_hits) {
    must(typeof h.dataset === "string", `${label}: trigger_hit missing dataset`);
    must(typeof h.id === "string", `${label}: trigger_hit missing id`);
  }
  must((o as any).policy.decision === "ALLOW", `${label}: ok:true policy.decision must be ALLOW`);
  must((o as any).policy.mode_reason === o.mode_reason, `${label}: ok:true policy.mode_reason must match mode_reason`);
  must(typeof (o as any).policy.decision_code === "string" && (o as any).policy.decision_code.length > 0, `${label}: ok:true missing policy.decision_code`);
  must(/^sha256:[a-f0-9]{64}$/.test((o as any).policy.governance_manifest_id), `${label}: ok:true missing governance_manifest_id`);
  must(!!(o as any).policy.dataset_versions, `${label}: ok:true missing policy.dataset_versions`);
  must(typeof (o as any).policy.dataset_versions.dual_use === "string", `${label}: ok:true missing dataset_versions.dual_use`);
  must(typeof (o as any).policy.dataset_versions.reconstruction === "string", `${label}: ok:true missing dataset_versions.reconstruction`);
  must(Array.isArray((o as any).policy.trigger_hits), `${label}: ok:true policy.trigger_hits must be array`);
  must(typeof (o as any).policy.evidence_status === "string", `${label}: ok:true missing policy.evidence_status`);
  must(Array.isArray(o.evidence) && o.evidence.length > 0, `${label}: ok:true must include non-empty evidence`);
  must(typeof o.response?.text === "string" && o.response.text.length > 0, `${label}: ok:true missing response text`);
}

function assertRefusal(out: PipelineOutput, label: string) {
  must(out.ok === false, `${label}: expected ok:false`);
  const o = out as Extract<PipelineOutput, { ok: false }>;
  must(typeof o.mode_reason === "string" && o.mode_reason.length > 0, `${label}: ok:false missing mode_reason`);
  must(!!(o as any).policy, `${label}: ok:false missing policy`);
  must(Array.isArray((o as any).policy.trigger_hits), `${label}: policy.trigger_hits must be an array`);
  for (const h of (o as any).policy.trigger_hits) {
    must(typeof h.dataset === "string", `${label}: trigger_hit missing dataset`);
    must(typeof h.id === "string", `${label}: trigger_hit missing id`);
  }
  must((o as any).policy.decision === "REFUSE", `${label}: ok:false policy.decision must be REFUSE`);
  must((o as any).policy.mode_reason === o.mode_reason, `${label}: ok:false policy.mode_reason must match mode_reason`);
  must(typeof (o as any).policy.decision_code === "string" && (o as any).policy.decision_code.length > 0, `${label}: ok:false missing policy.decision_code`);
  must(/^sha256:[a-f0-9]{64}$/.test((o as any).policy.governance_manifest_id), `${label}: ok:false missing governance_manifest_id`);
  must(!!(o as any).policy.dataset_versions, `${label}: ok:false missing policy.dataset_versions`);
  must(typeof (o as any).policy.dataset_versions.dual_use === "string", `${label}: ok:false missing dataset_versions.dual_use`);
  must(typeof (o as any).policy.dataset_versions.reconstruction === "string", `${label}: ok:false missing dataset_versions.reconstruction`);
  must(Array.isArray((o as any).policy.trigger_hits), `${label}: ok:false policy.trigger_hits must be array`);
  must(typeof (o as any).policy.evidence_status === "string", `${label}: ok:false missing policy.evidence_status`);
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
