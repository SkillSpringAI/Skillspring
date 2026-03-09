import type { Mode, ModeReasonCode } from "../types.js";
import type { ThreatScanResult } from "./threatScanner.js";

export type OrderedDecision = {
  mode: Mode;
  mode_reason: ModeReasonCode;
};

export function decideModeOrdered(threat: ThreatScanResult): OrderedDecision {
  // NOMOS-ORDER-01:
  // 1) architect override by explicit architecture/governance intent
  // 2) rights impact and risk trigger governance
  // 3) otherwise default safe

  if (threat.architect_hint) {
    return {
      mode: "ARCHITECT",
      mode_reason: "ARCHITECT_KEYWORDS"
    };
  }

  if (threat.reconstruction_risk) {
    return {
      mode: "GOVERNANCE",
      mode_reason: "RECONSTRUCTION_RISK"
    };
  }

  if (threat.dual_use) {
    return {
      mode: "GOVERNANCE",
      mode_reason: "DUAL_USE"
    };
  }

  if (threat.rights_impact) {
    return {
      mode: "GOVERNANCE",
      mode_reason: "RIGHTS_IMPACT"
    };
  }

  return {
    mode: "DEFAULT",
    mode_reason: "DEFAULT_SAFE"
  };
}
