import { ControlContext, ControlDecision } from "./control-plane.types.js";

/**
 * Mode Router
 * Deterministic mode selection only.
 * No inference. No escalation without signal.
 */

export function routeMode(context: ControlContext): ControlDecision {
  if (!context.domain) {
    return {
      status: "clarify",
      reason: "Domain not specified. Control Plane requires domain context."
    };
  }

  if (context.domain === "governance" || context.domain === "regulated") {
    return {
      status: "allow",
      mode: "MODE-GOVERNANCE"
    };
  }

  return {
    status: "allow",
    mode: "MODE-DEFAULT"
  };
}
