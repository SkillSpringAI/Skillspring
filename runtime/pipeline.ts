import { ControlContext } from "./control-plane/control-plane.types";
import { controlGate } from "./control-plane/control-gate";
import { execute } from "./execution-plane/execute";
import { checkAdmissibility } from "./output-plane/admissibility-gate";

/**
 * Pipeline Entry
 * Purpose: Enforce end-to-end governance.
 * This is the ONLY permitted execution path.
 */
export function runPipeline(context: ControlContext): unknown {
  // 1) Control Plane gate
  const decision = controlGate(context);

  // Clarify or refuse stops everything
  if ("status" in decision) {
    return decision;
  }

  // 2) Execution (stubbed)
  let executionArtifact: unknown;
  try {
    executionArtifact = execute(decision);
  } catch (e) {
    executionArtifact = {
      admissibility_status: "refused",
      evidence_status: { classification: "unknown" },
      authority_check: { within_bounds: true, violations: [] },
      enforcement_check: {
        passed: false,
        triggered_rules: ["execution-not-implemented"]
      }
    };
  }

  // 3) Output Plane admissibility gate
  const admissibility = checkAdmissibility(executionArtifact);

  if (admissibility.status !== "admissible") {
    return {
      status: "refused",
      reason: admissibility.reason
    };
  }

  // 4) Final output (placeholder)
  return executionArtifact;
}
