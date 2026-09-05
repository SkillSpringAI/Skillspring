/**
 * Execution Plan Types
 * Purpose: minimal, explicit plan emitted by Control Plane approval.
 */

import type { ExecutionAuthority } from "../authority/executionAuthority.js";

export interface ExecutionPlan {
  plan_id: string;
  trace_id: string;
  mode: string;
  domain: string;
  jurisdiction: string;
  resource: string;
  operation: string;
  purpose: string;
  policy_snapshot_id: string;
  authority: ExecutionAuthority;
}
