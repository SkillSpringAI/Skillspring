import { ControlContext, ControlDecision } from "./control-plane.types";
import { routeMode } from "./mode-router";
import { resolveJurisdiction } from "./jurisdiction-resolver";
import { checkAuthority } from "./authority-check";
import { ExecutionPlan } from "../execution-plane/execution-plan.types";

/**
 * Control Gate
 * Purpose: Single entry point that enforces Control Plane supremacy.
 * Returns either:
 * - a valid ExecutionPlan (allow), or
 * - a clarify/refuse decision (stop).
 *
 * No downstream execution is permitted without an ExecutionPlan.
 */
export function controlGate(context: ControlContext): ControlDecision | ExecutionPlan {
  // 1) Authority boundary check (hard stop)
  const auth = checkAuthority(context);
  if (auth.status !== "allow") return auth;

  // 2) Jurisdiction resolution (fail-closed to clarification)
  const juris = resolveJurisdiction(context);
  if (juris.status !== "allow") return juris;

  // 3) Mode routing (deterministic)
  const modeDecision = routeMode(context);
  if (modeDecision.status !== "allow") return modeDecision;

  // 4) Final allow: construct minimal plan
  return {
    mode: modeDecision.mode,
    domain: context.domain as string,
    jurisdiction: context.jurisdiction as string
  };
}
