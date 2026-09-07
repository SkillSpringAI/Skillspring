import assert from "node:assert/strict";
import { buildExecutionAuthority, revalidateExecutionAuthority, validateExecutionAuthority } from "../runtime/authority/executionAuthority.js";
import { assertTransition, canTransition, type ExecutionStatus } from "../runtime/executionLifecycle.js";
import { verifyReplay } from "../runtime/replay.js";
import type { ActionJournal, PlanJournal } from "../runtime/journal.js";
import { isDependentExecutionAllowed } from "../runtime/journal.js";

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
  assert.equal(revalidateExecutionAuthority(authority, { ...context, now: new Date(authority.issued_at) }).ok, true);
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, now: new Date(authority.expires_at) })), "EXPIRED_AUTHORITY");
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, now: new Date("2029-12-31T23:58:59Z") })), "NOT_YET_VALID_AUTHORITY");
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, now: new Date(NaN) })), "INVALID_CONTEXT");
  for (const value of [NaN, Infinity, -Infinity, -1]) {
    assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, current_risk: value })), "INVALID_CONTEXT");
    assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, risk_ceiling: value })), "INVALID_CONTEXT");
  }
  for (const issued_at of [authority.expires_at, "2031-01-01T00:00:00Z"]) {
    const invalid = { ...authority, issued_at };
    assert.equal(validateExecutionAuthority(invalid).ok, false);
    assert.equal(expectedCode(revalidateExecutionAuthority(invalid, context)), "INVALID_AUTHORITY");
    const { authority_id: _id, ...input } = invalid;
    assert.throws(() => buildExecutionAuthority(input), /validity window/);
  }
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, resource: "other" })), "SCOPE_MISMATCH");
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, policy_snapshot_id: "other" })), "POLICY_SNAPSHOT_MISMATCH");
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, revoked_authority_ids: new Set([authority.authority_id]) })), "REVOKED_AUTHORITY");
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, consumed_authority_ids: new Set([authority.authority_id]) })), "REPLAYED_AUTHORITY");
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, now: new Date("2030-01-01T00:06:00.000Z") })), "EXPIRED_AUTHORITY");
  assert.equal(expectedCode(revalidateExecutionAuthority(authority, { ...context, current_risk: 2 })), "RISK_CEILING_EXCEEDED");
  assert.equal(canTransition("EXECUTION_STARTED", "UNCERTAIN"), true);
  assert.equal(canTransition("UNCERTAIN", "COMPLETED"), false);
  assert.throws(() => assertTransition("UNCERTAIN", "COMPLETED"));
  const statuses: ExecutionStatus[] = ["NOT_ATTEMPTED", "PROPOSED", "ASSESSED", "REFUSED", "APPROVED",
    "AUTHORIZED", "EXECUTION_STARTED", "COMPLETED", "FAILED", "UNCERTAIN"];
  for (const status of statuses) {
    assert.equal(isDependentExecutionAllowed(status), false);
    assert.equal(isDependentExecutionAllowed(status, false), false);
    assert.equal(isDependentExecutionAllowed(status, true), status === "COMPLETED");
  }
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
  const check = (p: PlanJournal, actions: ActionJournal[]) => verifyReplay({ kind: "REPLAY_ARTIFACT", plan: p, actions }).ok;
  assert.equal(check(plan, [{ ...action, authority_id: "other" }]), false);
  assert.equal(check(plan, [{ ...action, outcome_proven: false }]), false);
  assert.equal(check(plan, [{ ...action, outcome_proven: undefined }]), false);
  assert.equal(check({ ...plan, action_count: 2, terminal_action_count: 2 }, [action, action]), false);
  assert.equal(check({ ...plan, terminal_action_count: 0 }, [action]), false);
  assert.equal(check({ ...plan, terminal_action_count: NaN }, [action]), false);
  assert.equal(check({ ...plan, uncertainty: true }, [action]), false);
  assert.equal(check({ ...plan, status: "PROPOSED" }, [action]), false);
  assert.equal(check({ ...plan, status: "REFUSED" }, [action]), false);
  assert.equal(check({ ...plan, status: "PROPOSED", terminal_action_count: 0 },
    [{ ...action, status: "PROPOSED", outcome_proven: undefined }]), true);
  for (const status of ["NOT_ATTEMPTED", "EXECUTION_STARTED", "FAILED", "REFUSED", "UNCERTAIN"] as const) {
    const terminal_action_count = ["FAILED", "REFUSED", "UNCERTAIN"].includes(status) ? 1 : 0;
    assert.equal(check({ ...plan, terminal_action_count }, [{ ...action, status, outcome_proven: false }]), false);
  }
  assert.equal(check({ ...plan, status: "UNCERTAIN", uncertainty: true },
    [{ ...action, status: "UNCERTAIN", outcome_proven: false }]), true);
  assert.equal(check({ ...plan, status: "EXECUTION_STARTED", terminal_action_count: 0 },
    [{ ...action, status: "EXECUTION_STARTED", outcome_proven: false }]), true);
  assert.equal(check({ ...plan, status: "FAILED" }, [{ ...action, status: "FAILED", outcome_proven: false }]), true);
  for (const malformed of [null, {}, { kind: "REPLAY_ARTIFACT", plan, actions: [null] }]) {
    assert.equal(verifyReplay(malformed as unknown as Parameters<typeof verifyReplay>[0]).ok, false);
  }
}

if (process.argv[1] && /authority-lifecycle\.(ts|js)$/.test(process.argv[1])) {
  checkAuthorityLifecycle();
  checkReplaySemantics();
  console.log("DIAG authority-lifecycle: PASS");
}
