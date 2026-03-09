import { decideAllowDecisionCode, decideRiskRefusalDecisionCode, buildInvalidInputRefusalMessage, buildRiskRefusalMessage, buildMissingDlaRefusalMessage, buildInvalidDlaRefusalMessage, buildMissingPtRefusalMessage } from "./policyEngine.js";
import { evaluateClaimsEvidence } from "./claimsEvidenceGate.js";
import type {PipelineInput, PipelineOutput, ModeReasonCode, PolicyBlock, PolicyEvidenceStatus, TriggerHit } from "./types.js";
import { classify, makeTraceId } from "./controlPlane.js";
import { executeStub } from "./executionPlane.js";
import { assertAdmissible } from "./outputGate.js";
import { buildDecisionLegitimacyArtifact, buildPermissionToken, validateDecisionLegitimacyArtifact, validatePermissionToken } from "./authority/artifacts.js";
import { verifyAuthority } from "./lumens.js";

const DATASET_VERSION_NOTE = "datasets: dual-use=v1; reconstruction=v1";

function parseDatasetVersions(note: string): { dual_use: string; reconstruction: string } {
  const du = /dual-use=([^\s;,\)]+)/i.exec(note)?.[1] ?? "UNKNOWN";
  const rc = /reconstruction=([^\s;,\)]+)/i.exec(note)?.[1] ?? "UNKNOWN";
  return { dual_use: du, reconstruction: rc };
}

function evidenceStatusFrom(evidence: Array<{ item: string; status: string }>): PolicyEvidenceStatus {
  const anyUnknown = evidence.some((e) => e.status === "UNKNOWN");
  return anyUnknown ? "UNKNOWN" : "KNOWN";
}

function makePolicy(
  decision: "ALLOW" | "REFUSE",
  decision_code: string,
  mode_reason: ModeReasonCode,
  evidence?: Array<{ item: string; status: string }>,
  trigger_hits?: readonly TriggerHit[]
): PolicyBlock {
  const dv = parseDatasetVersions(DATASET_VERSION_NOTE);

  const policy: PolicyBlock = {
    decision,
    decision_code,
    mode_reason,
    dataset_versions: {
      dual_use: dv.dual_use,
      reconstruction: dv.reconstruction
    },
    trigger_hits: trigger_hits ? [...trigger_hits] : [],
    evidence_status: evidence ? evidenceStatusFrom(evidence) : "UNKNOWN"
  };

  return Object.freeze(policy) as PolicyBlock;
}

function canonicalRefusal(
  mode: PipelineOutput["mode"],
  mode_reason: ModeReasonCode,
  trace_id: string,
  decision_code: string,
  refusal_code: string,
  message: string,
  trigger_hits: readonly TriggerHit[]
): PipelineOutput {
  return assertAdmissible({
    ok: false,
    mode,
    mode_reason,
    trace_id,
    policy: makePolicy("REFUSE", decision_code, mode_reason, undefined, trigger_hits),
    refusal: {
      code: refusal_code,
      message
    }
  });
}

export async function runGovernedPipeline(input: PipelineInput): Promise<PipelineOutput> {
  if (!input || typeof input.user_input !== "string" || input.user_input.trim() === "") {
    const mode_reason: ModeReasonCode = "DEFAULT_SAFE";
    return canonicalRefusal(
      "GOVERNANCE",
      mode_reason,
      "NO_TRACE_ID",
      "REFUSE_INVALID_INPUT",
      "REFUSE-INVALID-INPUT",
      buildInvalidInputRefusalMessage(DATASET_VERSION_NOTE),
      []
    );
  }

  const trace_id = makeTraceId(input.user_input);
  const ctx = classify(input);
  const mode_reason_note = `mode_reason=${ctx.mode_reason}`;

  const testOverrides = input.meta?.authority_test_overrides;
  const omitDla = testOverrides?.omit_dla === true;
  const omitPt = testOverrides?.omit_pt === true;
  const tamperDlaHash = testOverrides?.tamper_dla_hash === true;
  const tamperPtScopeEmpty = testOverrides?.tamper_pt_scope_empty === true;
  const lumensTamperDlaPayload = testOverrides?.lumens_tamper_dla_payload === true;
  const lumensPtBindingMismatch = testOverrides?.lumens_pt_binding_mismatch === true;
  const lumensPtExpired = testOverrides?.lumens_pt_expired === true;
  const baseDecisionCode = decideAllowDecisionCode(ctx.mode);

  // Branch 1 (always): build + validate DLA before any output emission.
  if (omitDla) {
    return canonicalRefusal(
      ctx.mode,
      ctx.mode_reason,
      trace_id,
      "REFUSE_MISSING_DLA",
      "REFUSE-MISSING-DLA",
      buildMissingDlaRefusalMessage(DATASET_VERSION_NOTE, mode_reason_note),
      ctx.trigger_hits ?? []
    );
  }

  const builtDla = buildDecisionLegitimacyArtifact({
    trace_id,
    mode: ctx.mode,
    mode_reason: ctx.mode_reason,
    policy_snapshot: {
      decision: ctx.risk.dual_use || ctx.risk.reconstruction_risk ? "REFUSE" : "ALLOW",
      decision_code: ctx.risk.dual_use || ctx.risk.reconstruction_risk ? "REFUSE_DUAL_USE_OR_RECONSTRUCTION" : baseDecisionCode,
      mode_reason: ctx.mode_reason
    }
  });

  const decisionArtifact = tamperDlaHash
    ? { ...builtDla, integrity_hash: "0".repeat(64) }
    : builtDla;

  const artifactCheck = validateDecisionLegitimacyArtifact(decisionArtifact);
  if (!artifactCheck.ok) {
    return canonicalRefusal(
      ctx.mode,
      ctx.mode_reason,
      trace_id,
      "REFUSE_INVALID_DLA",
      "REFUSE-INVALID-DLA",
      buildInvalidDlaRefusalMessage(artifactCheck.errors, DATASET_VERSION_NOTE, mode_reason_note),
      ctx.trigger_hits ?? []
    );
  }

  const lumensDla = lumensTamperDlaPayload
    ? {
        ...decisionArtifact,
        policy_snapshot: {
          ...decisionArtifact.policy_snapshot,
          decision_code: `${decisionArtifact.policy_snapshot.decision_code}_TAMPERED`
        }
      }
    : decisionArtifact;

  const lumensDlaCheck = verifyAuthority({ dla: lumensDla, policy: { mode: ctx.mode, mode_reason: ctx.mode_reason } });
  if (!lumensDlaCheck.ok) {
    return assertAdmissible({
      ok: false,
      mode: ctx.mode,
      mode_reason: ctx.mode_reason,
      trace_id,
      policy: makePolicy("REFUSE", "REFUSE_LUMENS_AUTHORITY", ctx.mode_reason, undefined, ctx.trigger_hits ?? []),
      refusal: {
        code: lumensDlaCheck.code,
        message: `${lumensDlaCheck.message} (${DATASET_VERSION_NOTE}; ${mode_reason_note})`,
        invariant_id: lumensDlaCheck.invariant_id,
        failure_code: lumensDlaCheck.failure_code,
        owner: lumensDlaCheck.owner,
        retry_scope: lumensDlaCheck.retry_scope
      }
    });
  }

  if (ctx.risk.dual_use || ctx.risk.reconstruction_risk) {
    const decision_code = decideRiskRefusalDecisionCode(ctx.risk);
    return canonicalRefusal(
      ctx.mode,
      ctx.mode_reason,
      trace_id,
      decision_code,
      "REFUSE-DUALUSE-OR-RECONSTRUCTION",
      buildRiskRefusalMessage(DATASET_VERSION_NOTE, mode_reason_note),
      ctx.trigger_hits ?? []
    );
  }

  // Branch 2 (allow-only): build + validate PT only after allow path is established.
  if (omitPt) {
    return canonicalRefusal(
      ctx.mode,
      ctx.mode_reason,
      trace_id,
      "REFUSE_MISSING_PT",
      "REFUSE-MISSING-PT",
      buildMissingPtRefusalMessage(DATASET_VERSION_NOTE, mode_reason_note),
      ctx.trigger_hits ?? []
    );
  }

  const builtPt = buildPermissionToken({
    bound_dla_id: decisionArtifact.id,
    allow_execution: true,
    allow_output: true,
    jurisdiction_scope: ["GLOBAL"],
    retry_scope: "none"
  });

  const permissionToken = tamperPtScopeEmpty
    ? { ...builtPt, jurisdiction_scope: [] as string[] }
    : lumensPtBindingMismatch
      ? { ...builtPt, bound_dla_id: "dla_mismatch" }
      : lumensPtExpired
        ? { ...builtPt, expires_at: "1970-01-01T00:00:00.000Z" }
        : builtPt;

  const tokenCheck = validatePermissionToken(permissionToken);
  if (!tokenCheck.ok) {
    return canonicalRefusal(
      ctx.mode,
      ctx.mode_reason,
      trace_id,
      "REFUSE_INVALID_PT",
      "REFUSE-INVALID-PT",
      `Permission token failed validation: ${tokenCheck.errors}. (${DATASET_VERSION_NOTE}; ${mode_reason_note})`,
      ctx.trigger_hits ?? []
    );
  }

  const lumensPtCheck = verifyAuthority({
    dla: lumensDla,
    pt: permissionToken,
    policy: { mode: ctx.mode, mode_reason: ctx.mode_reason }
  });
  if (!lumensPtCheck.ok) {
    return assertAdmissible({
      ok: false,
      mode: ctx.mode,
      mode_reason: ctx.mode_reason,
      trace_id,
      policy: makePolicy("REFUSE", "REFUSE_LUMENS_AUTHORITY", ctx.mode_reason, undefined, ctx.trigger_hits ?? []),
      refusal: {
        code: lumensPtCheck.code,
        message: `${lumensPtCheck.message} (${DATASET_VERSION_NOTE}; ${mode_reason_note})`,
        invariant_id: lumensPtCheck.invariant_id,
        failure_code: lumensPtCheck.failure_code,
        owner: lumensPtCheck.owner,
        retry_scope: lumensPtCheck.retry_scope
      }
    });
  }

  const exec = await executeStub(ctx);

  const claims = evaluateClaimsEvidence(input.user_input);
  const evidence: Array<{ item: string; status: "PROVIDED" | "ASSUMED" | "UNKNOWN" | "ESTIMATE" }> = [
    ...claims.evidence,
    { item: `Mode reason (${mode_reason_note})`, status: "ASSUMED" },
    { item: `Dataset versions (${DATASET_VERSION_NOTE})`, status: "PROVIDED" },
    { item: "Decision legitimacy artifact (present)", status: "PROVIDED" },
    { item: "Permission token (present)", status: "PROVIDED" }
  ];

  return assertAdmissible({
    ok: true,
    mode: ctx.mode,
    mode_reason: ctx.mode_reason,
    trace_id,
    policy: makePolicy("ALLOW", baseDecisionCode, ctx.mode_reason, evidence, ctx.trigger_hits ?? []),
    evidence,
    response: {
      type: "SAFE_STUB",
      text: `Governance pipeline OK. ${exec.note}\nNo agentic execution is implemented by design.`
    }
  });
}


