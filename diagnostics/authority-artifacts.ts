import { strict as assert } from "node:assert";

import {
  buildDecisionLegitimacyArtifact,
  buildPermissionToken,
  validateDecisionLegitimacyArtifact,
  validatePermissionToken
} from "../runtime/authority/artifacts.js";
import { runGovernedPipeline } from "../runtime/pipeline.js";

function assertCanonicalBoundRefusal(out: any, expectedCode: string) {
  assert.equal(out.ok, false, `expected refusal output for ${expectedCode}`);
  assert.equal(out.refusal.code, expectedCode, `expected refusal code ${expectedCode}`);
  assert.ok(typeof out.refusal.invariant_id === "string" && out.refusal.invariant_id.length > 0, "refusal must include invariant binding");
  assert.ok(typeof out.refusal.failure_code === "string" && out.refusal.failure_code.length > 0, "refusal must include failure code binding");
  assert.ok(typeof out.refusal.owner === "string" && out.refusal.owner.length > 0, "refusal must include owner binding");
  assert.ok(typeof out.refusal.retry_scope === "string" && out.refusal.retry_scope.length > 0, "refusal must include retry_scope binding");
}

export async function checkAuthorityArtifacts() {
  // Builder/validator unit coverage
  const dla = buildDecisionLegitimacyArtifact({
    trace_id: "trace_12345678",
    mode: "GOVERNANCE",
    mode_reason: "DUAL_USE",
    policy_snapshot: {
      decision: "REFUSE",
      decision_code: "REFUSE_DUAL_USE",
      mode_reason: "DUAL_USE"
    },
    timestamp: "2025-01-01T00:00:00.000Z"
  });

  const dlaValidation = validateDecisionLegitimacyArtifact(dla);
  assert.equal(dlaValidation.ok, true, `expected DLA to validate, got: ${JSON.stringify(dlaValidation)}`);

  const tamperedDla = { ...dla, integrity_hash: "0".repeat(64) };
  const tamperedValidation = validateDecisionLegitimacyArtifact(tamperedDla);
  assert.equal(tamperedValidation.ok, false, "tampered DLA hash should fail validation");

  const pt = buildPermissionToken({
    bound_dla_id: dla.id,
    allow_execution: true,
    allow_output: false,
    jurisdiction_scope: ["US"],
    retry_scope: "scoped_retry",
    expires_at: "2025-01-01T00:05:00.000Z"
  });

  const ptValidation = validatePermissionToken(pt);
  assert.equal(ptValidation.ok, true, `expected PT to validate, got: ${JSON.stringify(ptValidation)}`);

  const invalidPt = { ...pt, jurisdiction_scope: [] };
  const invalidPtValidation = validatePermissionToken(invalidPt);
  assert.equal(invalidPtValidation.ok, false, "PT with empty jurisdiction scope should fail validation");

  // Pipeline branch coverage
  const happy = await runGovernedPipeline({ user_input: "share a fun fact about trees" });
  assert.equal(happy.ok, true, "happy path must allow");
  assert.ok(happy.evidence.some((e) => e.item === "Decision legitimacy artifact (present)"), "allow branch should include DLA evidence");
  assert.ok(happy.evidence.some((e) => e.item === "Permission token (present)"), "allow branch should include PT evidence");

  const tamperedDlaRun = await runGovernedPipeline({
    user_input: "share a fun fact about trees",
    meta: { authority_test_overrides: { tamper_dla_hash: true } }
  });
  assertCanonicalBoundRefusal(tamperedDlaRun, "REFUSE-INVALID-DLA");

  const tamperedPtRun = await runGovernedPipeline({
    user_input: "share a fun fact about trees",
    meta: { authority_test_overrides: { tamper_pt_scope_empty: true } }
  });
  assertCanonicalBoundRefusal(tamperedPtRun, "REFUSE-INVALID-PT");

  const missingDlaRun = await runGovernedPipeline({
    user_input: "share a fun fact about trees",
    meta: { authority_test_overrides: { omit_dla: true } }
  });
  assertCanonicalBoundRefusal(missingDlaRun, "REFUSE-MISSING-DLA");

  const missingPtRun = await runGovernedPipeline({
    user_input: "share a fun fact about trees",
    meta: { authority_test_overrides: { omit_pt: true } }
  });
  assertCanonicalBoundRefusal(missingPtRun, "REFUSE-MISSING-PT");
}
