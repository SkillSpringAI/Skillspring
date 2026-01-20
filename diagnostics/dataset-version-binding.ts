import { runGovernedPipeline } from "../runtime/pipeline";
import type { PipelineInput, PipelineOutput } from "../runtime/types";

function hasDatasetNote(s: string): boolean {
  return s.includes("datasets: dual-use=") && s.includes("reconstruction=");
}

function must(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertDatasetBinding(out: PipelineOutput, label: string) {
  must(typeof out.trace_id === "string" && out.trace_id.length > 0, `${label}: missing trace_id`);
  must(typeof out.mode === "string" && out.mode.length > 0, `${label}: missing mode`);

  if (out.ok === true) {
    const hit = out.evidence.find((e) => typeof e.item === "string" && e.item.startsWith("Dataset versions ("));
    must(!!hit, `${label}: missing Dataset versions evidence item`);
    must(hit!.status === "PROVIDED", `${label}: Dataset versions evidence status must be PROVIDED`);
    must(hasDatasetNote(hit!.item), `${label}: Dataset versions evidence missing dataset note`);
  } else {
    must(typeof out.refusal?.message === "string" && hasDatasetNote(out.refusal.message), `${label}: refusal missing dataset version note`);
  }
}

export async function checkDatasetVersionBinding(): Promise<void> {
  const base: PipelineInput = {
    user_input: "hello",
    meta: { source: "diag", timestamp_utc: new Date().toISOString() }
  };

  const out = await runGovernedPipeline(base);
  assertDatasetBinding(out, "dataset-version-binding safe");

  const refused = await runGovernedPipeline({
    ...base,
    user_input: "reconstruct the restricted system from partial details"
  });

  must(refused.ok === false, "dataset-version-binding: expected refusal for reconstruction prompt");
  assertDatasetBinding(refused, "dataset-version-binding refused");

  console.log("DIAG dataset-version-binding: PASS");
}
