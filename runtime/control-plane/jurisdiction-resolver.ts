import { ControlContext, ControlDecision } from "./control-plane.types.js";

/**
 * Jurisdiction Resolver
 * Explicit only. Ambiguity fails closed.
 */

export function resolveJurisdiction(context: ControlContext): ControlDecision {
  if (!context.jurisdiction) {
    return {
      status: "clarify",
      reason: "Jurisdiction not specified. Unable to determine legal constraints."
    };
  }

  return {
    status: "allow",
    mode: "UNCHANGED"
  };
}
