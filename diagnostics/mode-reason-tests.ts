import { runGovernedPipeline } from "../runtime/pipeline.js";
import type { PipelineInput } from "../runtime/types.js";

function must(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

export async function checkModeReasonTransparency(): Promise<void> {
  const base: PipelineInput = {
    user_input: "hello",
    meta: { source: "diag", timestamp_utc: new Date().toISOString() }
  };

  const out = await runGovernedPipeline(base);

  if (out.ok === true) {
    const hit = out.evidence.find(
      (e) => typeof e.item === "string" && e.item.startsWith("Mode reason (mode_reason=")
    );
    must(!!hit, "mode-reason: missing Mode reason evidence item");
  } else {
    must(out.refusal.message.includes("mode_reason="), "mode-reason: refusal missing mode_reason");
  }

  const arch = await runGovernedPipeline({
    ...base,
    user_input: "system architect invariant test"
  });

  must(arch.mode === "ARCHITECT", "mode-reason: architect keywords did not force ARCHITECT mode");

  console.log("DIAG mode-reason: PASS");
}
