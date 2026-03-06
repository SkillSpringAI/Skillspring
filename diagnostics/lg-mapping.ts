import { strict as assert } from "node:assert";
import { decideFromFailureCode, decideFromInvariant } from "../runtime/lg.js";
import { assertAdmissible } from "../runtime/outputGate.js";
import type { PipelineOutput } from "../runtime/types.js";

function refusalFixture(overrides?: Partial<Extract<PipelineOutput, { ok: false }>['refusal']>): PipelineOutput {
  return {
    ok: false,
    mode: "GOVERNANCE",
    mode_reason: "DEFAULT_SAFE",
    trace_id: "LGDIAG12345",
    policy: {
      decision: "REFUSE",
      decision_code: "REFUSE_DIAG_CASE",
      mode_reason: "DEFAULT_SAFE",
      dataset_versions: { dual_use: "v2", reconstruction: "v2" },
      trigger_hits: [],
      evidence_status: "KNOWN"
    },
    refusal: {
      code: "REFUSE-DIAG-SYNTHETIC",
      message: "Synthetic LG DIAG refusal",
      invariant_id: "INV-010",
      failure_code: "LG-S-001",
      owner: "LG",
      retry_scope: "scoped_retry",
      ...overrides
    }
  };
}

export async function checkLgMapping(): Promise<void> {
  const op = decideFromFailureCode("OP-H-001");
  assert.equal(op.disposition, "HALT", "OP-H-* must map to HALT");

  const scoped = decideFromFailureCode("LG-S-001");
  assert.equal(scoped.disposition, "SCOPED_RETRY", "LG-S-001 must map to SCOPED_RETRY");

  const rebuild = decideFromFailureCode("LG-A-001");
  assert.equal(rebuild.disposition, "ARTIFACT_REBUILD", "LG-A-001 must map to ARTIFACT_REBUILD");

  const invScoped = decideFromInvariant("INV-010");
  assert.equal(invScoped.disposition, "SCOPED_RETRY", "INV-010 should resolve via failure mapping to SCOPED_RETRY");

  let threw = false;
  try {
    decideFromFailureCode("UNKNOWN-000");
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "unknown failure_code should throw in LG mapper");

  const unknownFailure = assertAdmissible(
    refusalFixture({ failure_code: "UNKNOWN-000", retry_scope: "none" })
  );
  assert.equal(unknownFailure.ok, false, "unknown failure_code should fail closed");
  assert.equal(unknownFailure.refusal.code, "REFUSE-LG-FAILURE-CODE-UNREGISTERED", "unknown failure_code should map to LG binding-law refusal");
  assert.equal(unknownFailure.refusal.failure_code, "LG-H-002", "unknown failure_code should bind LG-H-002");

  const mismatchRetry = assertAdmissible(
    refusalFixture({ retry_scope: "none" })
  );
  assert.equal(mismatchRetry.ok, false, "retry_scope mismatch should fail closed");
  assert.equal(mismatchRetry.refusal.code, "REFUSE-LG-RETRY-SCOPE-MISMATCH", "retry_scope mismatch should map to LG binding-law refusal");
  assert.equal(mismatchRetry.refusal.failure_code, "LG-H-001", "retry_scope mismatch should bind LG-H-001 best-fit law");
}
