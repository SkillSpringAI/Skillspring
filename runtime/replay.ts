import type { ActionJournal, PlanJournal } from "./journal.js";

export type ReplayArtifact = {
  kind: "REPLAY_ARTIFACT";
  plan: PlanJournal;
  actions: readonly ActionJournal[];
};

export type ReplayVerification = { ok: true } | { ok: false; reason: string };

export function verifyReplay(artifact: ReplayArtifact): ReplayVerification {
  if (artifact.plan.kind !== "PLAN_JOURNAL") return { ok: false, reason: "missing plan journal" };
  if (artifact.actions.some((action) => action.plan_id !== artifact.plan.plan_id || action.trace_id !== artifact.plan.trace_id)) {
    return { ok: false, reason: "action continuity mismatch" };
  }
  if (artifact.plan.action_count !== artifact.actions.length) return { ok: false, reason: "action count mismatch" };
  if (artifact.plan.status === "UNCERTAIN" && artifact.actions.some((action) => action.status === "COMPLETED" && action.outcome_proven !== true)) {
    return { ok: false, reason: "uncertain plan contains unproven completed action" };
  }
  return { ok: true };
}
