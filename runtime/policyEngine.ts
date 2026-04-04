import type { Mode } from "./types.js";

export function decideAllowDecisionCode(mode: Mode): string {
  if (mode === "DEFAULT") return "ALLOW_DEFAULT_SAFE";
  if (mode === "GOVERNANCE") return "ALLOW_GOVERNED_SAFE";
  return "ALLOW_ARCHITECT_SAFE";
}

export function decideRiskRefusalDecisionCode(risk: { reconstruction_risk: boolean; dual_use: boolean }): string {
  if (risk.reconstruction_risk) return "REFUSE_RECONSTRUCTION_RISK";
  if (risk.dual_use) return "REFUSE_DUAL_USE";
  return "REFUSE_POLICY_UNSPECIFIED";
}

function buildInvalidInputRefusalMessage(datasetVersionNote: string): string {
  return `Invalid or missing user_input. (${datasetVersionNote})`;
}

function buildRiskRefusalMessage(datasetVersionNote: string, modeReasonNote: string): string {
  return `Request appears dual-use or reconstruction-risk. Refusing under governance policy. (${datasetVersionNote}; ${modeReasonNote})`;
}

function buildMissingDlaRefusalMessage(datasetVersionNote: string, modeReasonNote: string): string {
  return `Decision legitimacy artifact missing under required authority policy. (${datasetVersionNote}; ${modeReasonNote})`;
}

function buildInvalidDlaRefusalMessage(errors: string, datasetVersionNote: string, modeReasonNote: string): string {
  return `Decision legitimacy artifact failed validation: ${errors}. (${datasetVersionNote}; ${modeReasonNote})`;
}

function buildMissingPtRefusalMessage(datasetVersionNote: string, modeReasonNote: string): string {
  return `Permission token missing under required authority policy. (${datasetVersionNote}; ${modeReasonNote})`;
}

export function buildMissingPtRefusalPolicy(datasetVersionNote: string, modeReasonNote: string): RefusalPolicy {
  return {
    decision_code: "REFUSE_MISSING_PT",
    refusal_code: "REFUSE-MISSING-PT",
    message: buildMissingPtRefusalMessage(datasetVersionNote, modeReasonNote)
  };
}

function buildInvalidPtRefusalMessage(errors: string, datasetVersionNote: string, modeReasonNote: string): string {
  return `Permission token failed validation: ${errors}. (${datasetVersionNote}; ${modeReasonNote})`;
}

export function buildInvalidPtRefusalPolicy(errors: string, datasetVersionNote: string, modeReasonNote: string): RefusalPolicy {
  return {
    decision_code: "REFUSE_INVALID_PT",
    refusal_code: "REFUSE-INVALID-PT",
    message: buildInvalidPtRefusalMessage(errors, datasetVersionNote, modeReasonNote)
  };
}

export type RefusalPolicy = {
  decision_code: string;
  refusal_code: string;
  message: string;
};

export type AllowPolicy = {
  decision_code: string;
};

export function buildAllowPolicy(mode: Mode): AllowPolicy {
  return {
    decision_code: decideAllowDecisionCode(mode)
  };
}

export function buildPolicySnapshotDecisionCode(
  risk: { reconstruction_risk: boolean; dual_use: boolean },
  mode: Mode
): string {
  if (risk.dual_use || risk.reconstruction_risk) return decideRiskRefusalDecisionCode(risk);
  return decideAllowDecisionCode(mode);
}

export function buildRiskRefusalPolicy(
  risk: { reconstruction_risk: boolean; dual_use: boolean },
  datasetVersionNote: string,
  modeReasonNote: string
): RefusalPolicy {
  return {
    decision_code: decideRiskRefusalDecisionCode(risk),
    refusal_code: "REFUSE-DUALUSE-OR-RECONSTRUCTION",
    message: buildRiskRefusalMessage(datasetVersionNote, modeReasonNote)
  };
}

export function buildInvalidInputRefusalPolicy(datasetVersionNote: string): RefusalPolicy {
  return {
    decision_code: "REFUSE_INVALID_INPUT",
    refusal_code: "REFUSE-INVALID-INPUT",
    message: buildInvalidInputRefusalMessage(datasetVersionNote)
  };
}

export function buildMissingDlaRefusalPolicy(datasetVersionNote: string, modeReasonNote: string): RefusalPolicy {
  return {
    decision_code: "REFUSE_MISSING_DLA",
    refusal_code: "REFUSE-MISSING-DLA",
    message: buildMissingDlaRefusalMessage(datasetVersionNote, modeReasonNote)
  };
}

export function buildInvalidDlaRefusalPolicy(errors: string, datasetVersionNote: string, modeReasonNote: string): RefusalPolicy {
  return {
    decision_code: "REFUSE_INVALID_DLA",
    refusal_code: "REFUSE-INVALID-DLA",
    message: buildInvalidDlaRefusalMessage(errors, datasetVersionNote, modeReasonNote)
  };
}
