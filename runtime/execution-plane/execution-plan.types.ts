/**
 * Execution Plan Types
 * Purpose: minimal, explicit plan emitted by Control Plane approval.
 */

export interface ExecutionPlan {
  mode: string;
  domain: string;
  jurisdiction: string;
}
