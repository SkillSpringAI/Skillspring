import { ExecutionPlan } from "./execution-plan.types.js";

/**
 * Execution Entry
 * Purpose: enforce that execution cannot run without a Control-approved plan.
 * NOTE: v0.1 intentionally does not implement reasoning yet.
 */
export function execute(_plan: ExecutionPlan): never {
  throw new Error("Execution not implemented. Requires cycles and enforcement wiring.");
}
