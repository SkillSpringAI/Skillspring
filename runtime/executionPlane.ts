import type { ClassifiedContext, ExecutionArtifact } from "./types.ts";

export async function executeStub(
  ctx: ClassifiedContext
): Promise<ExecutionArtifact> {
  return {
    kind: "STUB",
    note: `Execution is intentionally not implemented. Mode=${ctx.mode}`
  };
}
