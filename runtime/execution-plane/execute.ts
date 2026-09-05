import { ExecutionPlan } from "./execution-plan.types.js";
import { revalidateExecutionAuthority } from "../authority/executionAuthority.js";

/**
 * Execution Entry
 * Purpose: enforce that execution cannot run without a Control-approved plan.
 * NOTE: v0.1 intentionally does not implement reasoning yet.
 */
export function execute(plan: ExecutionPlan): never {
  const authority = revalidateExecutionAuthority(plan.authority, {
    trace_id: plan.trace_id,
    policy_snapshot_id: plan.policy_snapshot_id,
    resource: plan.resource,
    operation: plan.operation,
    risk_ceiling: 0,
    current_risk: 0
  });
  if (!authority.ok) throw new Error(`Execution refused before side effect: ${authority.code}`);
  throw new Error("Execution not implemented. Requires cycles and enforcement wiring.");
}
