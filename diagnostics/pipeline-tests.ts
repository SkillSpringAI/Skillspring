/**
 * Diagnostic: Pipeline Fail-Closed Guarantees
 * Purpose: Assert that the end-to-end pipeline cannot emit outputs
 * without passing control, execution, and admissibility gates.
 */

import { runPipeline } from "../runtime/pipeline";

export function pipelineFailClosedDiagnostics(): void {
  // Missing context → clarify
  const missingContext = runPipeline({});
  if ((missingContext as any).status !== "clarify") {
    throw new Error("Pipeline failed: missing context did not clarify.");
  }

  // Authority escalation → refuse
  const authorityEscalation = runPipeline({
    domain: "general",
    jurisdiction: "NZ",
    authorityRequested: true
  });
  if ((authorityEscalation as any).status !== "refused") {
    throw new Error("Pipeline failed: authority escalation not refused.");
  }

  // Valid context but no execution logic → refused (fail closed)
  const validContext = runPipeline({
    domain: "general",
    jurisdiction: "NZ"
  });
  if ((validContext as any).status !== "refused") {
    throw new Error("Pipeline failed: execution did not fail closed.");
  }
}
