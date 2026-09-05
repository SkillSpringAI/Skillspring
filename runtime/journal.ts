import type { ExecutionStatus } from "./executionLifecycle.js";

export type PlanJournal = {
  kind: "PLAN_JOURNAL";
  plan_id: string;
  trace_id: string;
  authority_id: string;
  policy_snapshot_id: string;
  status: ExecutionStatus;
  action_count: number;
  terminal_action_count: number;
  uncertainty: boolean;
  failure_code?: string;
};

export type ActionJournal = {
  kind: "ACTION_JOURNAL";
  action_id: string;
  plan_id: string;
  trace_id: string;
  authority_id: string;
  status: ExecutionStatus;
  started_at?: string;
  completed_at?: string;
  outcome_proven?: boolean;
  failure_code?: string;
};

export function isDependentExecutionAllowed(status: ExecutionStatus): boolean {
  return status !== "UNCERTAIN" && status !== "FAILED" && status !== "REFUSED";
}
