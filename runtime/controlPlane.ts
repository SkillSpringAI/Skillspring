import crypto from "node:crypto";
import type { PipelineInput, ClassifiedContext } from "./types.js";
import { scanThreats } from "./metaNomos/threatScanner.js";
import { classifyJurisdiction } from "./metaNomos/jurisdictionClassifier.js";
import { decideModeOrdered } from "./metaNomos/modeDecision.js";

export function makeTraceId(userInput: string): string {
  const h = crypto.createHash("sha256").update(String(userInput)).digest("hex");
  return h.slice(0, 16);
}

export function classify(input: PipelineInput): ClassifiedContext {
  const text = input?.user_input ?? "";

  // MN-SPLIT-01:
  // Jurisdiction classification and threat scanning are separated modules.
  const jurisdiction = classifyJurisdiction(text);
  const threat = scanThreats(text);

  // NOMOS-ORDER-01:
  // Mode decision is derived only after threat scanning is complete,
  // with explicit ordered precedence.
  const ordered = decideModeOrdered(threat);

  return {
    mode: ordered.mode,
    mode_reason: ordered.mode_reason,
    domain_hints: [],
    trigger_hits: threat.trigger_hits,
    jurisdiction,
    risk: {
      rights_impact: threat.rights_impact,
      dual_use: threat.dual_use,
      reconstruction_risk: threat.reconstruction_risk,
      reason_code: threat.reason_code,
      confidence: threat.confidence
    }
  };
}
