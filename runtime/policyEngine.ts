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

export function buildInvalidInputRefusalMessage(datasetVersionNote: string): string {
  return `Invalid or missing user_input. (${datasetVersionNote})`;
}

export function buildRiskRefusalMessage(datasetVersionNote: string, modeReasonNote: string): string {
  return `Request appears dual-use or reconstruction-risk. Refusing under governance policy. (${datasetVersionNote}; ${modeReasonNote})`;
}

export function buildMissingDlaRefusalMessage(datasetVersionNote: string, modeReasonNote: string): string {
  return `Decision legitimacy artifact missing under required authority policy. (${datasetVersionNote}; ${modeReasonNote})`;
}

export function buildInvalidDlaRefusalMessage(errors: string, datasetVersionNote: string, modeReasonNote: string): string {
  return `Decision legitimacy artifact failed validation: ${errors}. (${datasetVersionNote}; ${modeReasonNote})`;
}

export function buildMissingPtRefusalMessage(datasetVersionNote: string, modeReasonNote: string): string {
  return `Permission token missing under required authority policy. (${datasetVersionNote}; ${modeReasonNote})`;
}
