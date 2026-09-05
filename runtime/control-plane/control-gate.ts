import { ControlContext, ControlDecision } from "./control-plane.types.js";
import { routeMode } from "./mode-router.js";
import { resolveJurisdiction } from "./jurisdiction-resolver.js";
import { checkAuthority } from "./authority-check.js";

/**
 * Control Gate
 * Purpose: Single entry point that enforces Control Plane supremacy.
 * Returns either:
 * - a valid ExecutionPlan (allow), or
 * - a clarify/refuse decision (stop).
 *
 * No downstream execution is permitted without an ExecutionPlan.
 */
export function controlGate(context: ControlContext): ControlDecision {
  // 1) Authority boundary check (hard stop)
  const auth = checkAuthority(context);
  if (auth.status !== "allow") return auth;

  // 2) Jurisdiction resolution (fail-closed to clarification)
  const juris = resolveJurisdiction(context);
  if (juris.status !== "allow") return juris;

  // 3) Mode routing (deterministic)
  const modeDecision = routeMode(context);
  if (modeDecision.status !== "allow") return modeDecision;

  // 4) No plan is issued until action-bound execution authority exists.
  return {
    status: "refuse",
    reason: `Execution authority is not issued by the current inert runtime (mode=${modeDecision.mode}).`
  };
}
