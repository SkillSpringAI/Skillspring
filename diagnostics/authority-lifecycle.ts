import assert from "node:assert/strict";
import { buildExecutionAuthority, revalidateExecutionAuthority, validateExecutionAuthority } from "../runtime/authority/executionAuthority.js";
import { assertTransition, canTransition } from "../runtime/executionLifecycle.js";
import { verifyReplay } from "../runtime/replay.js";
import type { ActionJournal, PlanJournal } from "../runtime/journal.js";

const now = new Date("2030-01-01T00:00:00.000Z");
const authority = buildExecutionAuthority({
  trace_id: "trace_phase2_123",
  bound_dla_id: "dla_phase2_123",
  capability: "example.read",
  scope: { resource: "example-resource", operation: "read" },
  purpose: "phase 2 diagnostic",
  issued_at: "2029-12-31T23:59:00.000Z",
  expires_at: "2030-01-01T00:05:00.000Z",
  one_use: true,
  policy_snapshot_id: "policy_phase2_123"
});

function expectedCode(result: ReturnType<typeof revalidateExecutionAuthority>): string {
  if (result.ok) throw new Error("expected authority revalidation failure");
  return result.code;
}

export function checkAuthorityLifecycle(): void {
  assert.equal(validateExecutionAuthority(authority).ok, true);
  const context = {
    trace_id: authority.trace_id,
    policy_snapshot_id: authority.policy_snapshot_id,
    resource: "example-resource",
    operation: "read",
    risk_ceiling: 1,
    current_risk: 0,
    now
  };
  assert.equal(revalidateExecutionAuthority(authority, context).ok, true);
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, resource: "other" })), "SCOPE_MISMATCH");
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, policy_snapshot_id: "other" })), "POLICY_SNAPSHOT_MISMATCH");
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, revoked_authority_ids: new Set([authority.authority_id]) })), "REVOKED_AUTHORITY");
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, consumed_authority_ids: new Set([authority.authority_id]) })), "REPLAYED_AUTHORITY");
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, now: new Date("2030-01-01T00:06:00.000Z") })), "EXPIRED_AUTHORITY");
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, current_risk: 2 })), "RISK_CEILING_EXCEEDED");
  assert.equal(canTransition("EXECUTION_STARTED", "UNCERTAIN"), true);
  assert.equal(canTransition("UNCERTAIN", "COMPLETED"), false);
  assert.throws(() => assertTransition("UNCERTAIN", "COMPLETED"));
}

export function checkReplaySemantics(): void {
  const plan: PlanJournal = {
    kind: "PLAN_JOURNAL", plan_id: "plan_phase2_123", trace_id: authority.trace_id,
    authority_id: authority.authority_id, policy_snapshot_id: authority.policy_snapshot_id,
    status: "COMPLETED", action_count: 1, terminal_action_count: 1, uncertainty: false
  };
  const action: ActionJournal = {
    kind: "ACTION_JOURNAL", action_id: "action_phase2_123", plan_id: plan.plan_id,
    trace_id: plan.trace_id, authority_id: authority.authority_id, status: "COMPLETED", outcome_proven: true
  };
  assert.deepEqual(verifyReplay({ kind: "REPLAY_ARTIFACT", plan, actions: [action] }), { ok: true });
  assert.equal(verifyReplay({ kind: "REPLAY_ARTIFACT", plan: { ...plan, action_count: 2 }, actions: [action] }).ok, false);
  assert.equal(verifyReplay({ kind: "REPLAY_ARTIFACT", plan, actions: [{ ...action, trace_id: "other" }] }).ok, false);
}

if (process.argv[1] && /authority-lifecycle\.(ts|js)$/.test(process.argv[1])) {
  checkAuthorityLifecycle();
  checkReplaySemantics();
  console.log("DIAG authority-lifecycle: PASS");
}
