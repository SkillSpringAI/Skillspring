import type {PipelineInput, PipelineOutput, ModeReasonCode, PolicyBlock, PolicyEvidenceStatus, TriggerHit } from "./types.js";
import { classify, makeTraceId } from "./controlPlane.js";
import { executeStub } from "./executionPlane.js";
import { assertAdmissible } from "./outputGate.js";

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

function makePolicy(decision: "ALLOW" | "REFUSE",
  decision_code: string,
  mode_reason: ModeReasonCode,
  evidence?: Array<{ item: string; status: string }>,
  trigger_hits?: TriggerHit[]
): PolicyBlock {
  const dv = parseDatasetVersions(DATASET_VERSION_NOTE);
  return {
    decision,
    decision_code,
    mode_reason,
    dataset_versions: {
      dual_use: dv.dual_use,
      reconstruction: dv.reconstruction
    },
    trigger_hits: trigger_hits ?? [],
    evidence_status: evidence ? evidenceStatusFrom(evidence) : "UNKNOWN"
  };
}

export async function runGovernedPipeline(input: PipelineInput): Promise<PipelineOutput> {
  // Fail-closed invalid input
  if (!input || typeof input.user_input !== "string" || input.user_input.trim() === "") {
    const mode_reason: ModeReasonCode = "DEFAULT_SAFE";
    return assertAdmissible({
      ok: false,
      mode: "GOVERNANCE",
      mode_reason,
      trace_id: "NO_TRACE_ID",
      policy: makePolicy("REFUSE", "REFUSE_INVALID_INPUT", mode_reason, undefined, []),
      refusal: {
        code: "REFUSE-INVALID-INPUT",
        message: "Invalid or missing user_input. (" + DATASET_VERSION_NOTE + ")"
      }
    });
  }

  const trace_id = makeTraceId(input.user_input);
  const ctx = classify(input);
  const mode_reason_note = `mode_reason=${ctx.mode_reason}`;

  // Hard refusal triggers (fail-closed)
  if (ctx.risk.dual_use || ctx.risk.reconstruction_risk) {
    const decision_code = ctx.risk.reconstruction_risk ? "REFUSE_RECONSTRUCTION_RISK" : "REFUSE_DUAL_USE";
    return assertAdmissible({
      ok: false,
      mode: ctx.mode,
      mode_reason: ctx.mode_reason,
      trace_id,
      policy: makePolicy("REFUSE", decision_code, ctx.mode_reason, undefined, ctx.trigger_hits ?? []),
      refusal: {
        code: "REFUSE-DUALUSE-OR-RECONSTRUCTION",
        message:
          `Request appears dual-use or reconstruction-risk. Refusing under governance policy. (${DATASET_VERSION_NOTE}; ${mode_reason_note})`
      }
    });
  }

  // Control -> Execution handshake (stub)
  const exec = await executeStub(ctx);

  const evidence: Array<{ item: string; status: "PROVIDED" | "ASSUMED" | "UNKNOWN" | "ESTIMATE" }> = [
    { item: "User input content", status: "PROVIDED" },
    { item: "Jurisdiction", status: "UNKNOWN" },
    { item: "Domain classification", status: "ASSUMED" },
    { item: `Mode reason (${mode_reason_note})`, status: "ASSUMED" },
    { item: `Dataset versions (${DATASET_VERSION_NOTE})`, status: "PROVIDED" }
  ];

  const decision_code =
    ctx.mode === "DEFAULT" ? "ALLOW_DEFAULT_SAFE" : ctx.mode === "GOVERNANCE" ? "ALLOW_GOVERNED_SAFE" : "ALLOW_ARCHITECT_SAFE";

  const out: PipelineOutput = {
    ok: true,
    mode: ctx.mode,
    mode_reason: ctx.mode_reason,
    trace_id,
    policy: makePolicy("ALLOW", decision_code, ctx.mode_reason, evidence, ctx.trigger_hits ?? []),
    evidence,
    response: {
      type: "SAFE_STUB",
      text: `Governance pipeline OK. ${exec.note}\n` + `No agentic execution is implemented by design.`
    }
  };

  return assertAdmissible(out);
}
