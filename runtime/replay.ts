import type { ActionJournal, PlanJournal } from "./journal.js";
import { isExecutionStatus, type ExecutionStatus } from "./executionLifecycle.js";

export type ReplayArtifact = {
  kind: "REPLAY_ARTIFACT";
  plan: PlanJournal;
  actions: readonly ActionJournal[];
};

export type ReplayVerification = { ok: true } | { ok: false; reason: string };

export function verifyReplay(artifact: ReplayArtifact): ReplayVerification {
  if (!artifact || artifact.kind !== "REPLAY_ARTIFACT" || !Array.isArray(artifact.actions)) {
    return { ok: false, reason: "invalid replay artifact" };
  }
  const plan = artifact.plan;
  const nonempty = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const terminal = (status: ExecutionStatus) => ["COMPLETED", "FAILED", "REFUSED", "UNCERTAIN"].includes(status);
  if (!plan || plan.kind !== "PLAN_JOURNAL" || !isExecutionStatus(plan.status) ||
      ![plan.plan_id, plan.trace_id, plan.authority_id, plan.policy_snapshot_id].every(nonempty) ||
      typeof plan.uncertainty !== "boolean") return { ok: false, reason: "invalid plan journal" };
  if (artifact.actions.some(action => !action || action.kind !== "ACTION_JOURNAL" ||
      !isExecutionStatus(action.status) || !nonempty(action.action_id) ||
      (action.outcome_proven !== undefined && typeof action.outcome_proven !== "boolean"))) {
    return { ok: false, reason: "invalid action journal" };
  }
  if (artifact.actions.some((action) => action.plan_id !== plan.plan_id || action.trace_id !== plan.trace_id ||
      action.authority_id !== plan.authority_id)) {
    return { ok: false, reason: "action continuity mismatch" };
  }
  if (!Number.isSafeInteger(plan.action_count) || plan.action_count !== artifact.actions.length) return { ok: false, reason: "action count mismatch" };
  if (new Set(artifact.actions.map(action => action.action_id)).size !== artifact.actions.length) {
    return { ok: false, reason: "duplicate action ID" };
  }
  if (!Number.isSafeInteger(plan.terminal_action_count) ||
      plan.terminal_action_count !== artifact.actions.filter(action => terminal(action.status)).length) {
    return { ok: false, reason: "terminal action count mismatch" };
  }
  if (artifact.actions.some((action) => action.status === "COMPLETED" && action.outcome_proven !== true)) {
    return { ok: false, reason: "unproven completed action" };
  }
  if (plan.uncertainty !== (plan.status === "UNCERTAIN") ||
      (artifact.actions.some(action => action.status === "UNCERTAIN") && !plan.uncertainty)) {
    return { ok: false, reason: "uncertainty mismatch" };
  }
  if (plan.status === "COMPLETED" && artifact.actions.some(action => action.status !== "COMPLETED")) {
    return { ok: false, reason: "completed plan contains incomplete action" };
  }
  const preparation: ExecutionStatus[] = ["NOT_ATTEMPTED", "PROPOSED", "ASSESSED", "APPROVED", "AUTHORIZED"];
  const phase = preparation.indexOf(plan.status);
  if (phase >= 0 && artifact.actions.some(action =>
      preparation.indexOf(action.status) < 0 || preparation.indexOf(action.status) > phase)) {
    return { ok: false, reason: "action precedes plan authorization" };
  }
  if (plan.status === "REFUSED" && artifact.actions.some(action =>
      !preparation.includes(action.status) && action.status !== "REFUSED")) {
    return { ok: false, reason: "refused plan contains attempted action" };
  }
  if (terminal(plan.status) && artifact.actions.some(action => action.status === "EXECUTION_STARTED")) {
    return { ok: false, reason: "terminal plan contains running action" };
  }
  return { ok: true };
}
