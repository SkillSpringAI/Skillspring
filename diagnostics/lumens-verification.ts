import { strict as assert } from "node:assert";
import { buildDecisionLegitimacyArtifact, buildPermissionToken } from "../runtime/authority/artifacts.js";
import { verifyAuthority } from "../runtime/lumens.js";
import { runGovernedPipeline } from "../runtime/pipeline.js";

export async function checkLumensVerification(): Promise<void> {
  const dla = buildDecisionLegitimacyArtifact({
    trace_id: "trace_lumens_1234",
    mode: "DEFAULT",
    mode_reason: "DEFAULT_SAFE",
    policy_snapshot: {
      decision: "ALLOW",
      decision_code: "ALLOW_DEFAULT_SAFE",
      mode_reason: "DEFAULT_SAFE"
    },
    timestamp: "2025-01-01T00:00:00.000Z"
  });

  const pt = buildPermissionToken({
    bound_dla_id: dla.id,
    allow_execution: true,
    allow_output: true,
    retry_scope: "none",
    expires_at: "2030-01-01T00:00:00.000Z"
  });

  const happy = verifyAuthority({ dla, pt, now: new Date("2026-01-01T00:00:00.000Z") });
  assert.equal(happy.ok, true, "Lumens happy path should pass");

  const tampered = verifyAuthority({
    dla: {
      ...dla,
      policy_snapshot: { ...dla.policy_snapshot, decision_code: "ALLOW_TAMPERED" }
    },
    pt,
    now: new Date("2026-01-01T00:00:00.000Z")
  });
  assert.equal(tampered.ok, false, "tampered DLA should fail");
  if (!tampered.ok) {
    assert.equal(tampered.code, "REFUSE-LUMENS-DLA-INTEGRITY");
    assert.equal(tampered.failure_code, "LG-H-001");
  }

  const bindingMismatch = verifyAuthority({
    dla,
    pt: { ...pt, bound_dla_id: "dla_mismatch" },
    now: new Date("2026-01-01T00:00:00.000Z")
  });
  assert.equal(bindingMismatch.ok, false, "PT binding mismatch should fail");
  if (!bindingMismatch.ok) {
    assert.equal(bindingMismatch.code, "REFUSE-LUMENS-PT-BINDING");
    assert.equal(bindingMismatch.failure_code, "LG-H-001");
  }

  const expired = verifyAuthority({
    dla,
    pt: { ...pt, expires_at: "1970-01-01T00:00:00.000Z" },
    now: new Date("2026-01-01T00:00:00.000Z")
  });
  assert.equal(expired.ok, false, "expired PT should fail");
  if (!expired.ok) {
    assert.equal(expired.code, "REFUSE-LUMENS-PT-EXPIRED");
    assert.equal(expired.failure_code, "LG-H-001");
  }

  const pipelineHappy = await runGovernedPipeline({ user_input: "hello world" });
  assert.equal(pipelineHappy.ok, true, "pipeline happy path should still allow");

  const pipelineTamperDla = await runGovernedPipeline({
    user_input: "hello world",
    meta: { authority_test_overrides: { lumens_tamper_dla_payload: true } }
  });
  assert.equal(pipelineTamperDla.ok, false, "pipeline should refuse tampered lumens DLA payload");
  assert.equal(pipelineTamperDla.refusal.code, "REFUSE-LUMENS-DLA-INTEGRITY");
  assert.equal(pipelineTamperDla.refusal.failure_code, "LG-H-001");

  const pipelineBinding = await runGovernedPipeline({
    user_input: "hello world",
    meta: { authority_test_overrides: { lumens_pt_binding_mismatch: true } }
  });
  assert.equal(pipelineBinding.ok, false, "pipeline should refuse PT binding mismatch");
  assert.equal(pipelineBinding.refusal.code, "REFUSE-LUMENS-PT-BINDING");
  assert.equal(pipelineBinding.refusal.failure_code, "LG-H-001");

  const pipelineExpiry = await runGovernedPipeline({
    user_input: "hello world",
    meta: { authority_test_overrides: { lumens_pt_expired: true } }
  });
  assert.equal(pipelineExpiry.ok, false, "pipeline should refuse expired PT");
  assert.equal(pipelineExpiry.refusal.code, "REFUSE-LUMENS-PT-EXPIRED");
  assert.equal(pipelineExpiry.refusal.failure_code, "LG-H-001");
}
