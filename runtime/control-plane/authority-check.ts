import { ControlContext, ControlDecision } from "./control-plane.types";

/**
 * Authority Check
 * Absolute boundary enforcement.
 */

export function checkAuthority(context: ControlContext): ControlDecision {
  if (context.authorityRequested === true) {
    return {
      status: "refuse",
      reason: "Authority escalation is prohibited by constitutional rules."
    };
  }

  return {
    status: "allow",
    mode: "UNCHANGED"
  };
}
