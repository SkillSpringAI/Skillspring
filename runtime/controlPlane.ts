import crypto from "node:crypto";
import type { PipelineInput, ClassifiedContext, Mode, ModeReasonCode } from "./types.js";
import { scanThreats } from "./metaNomos/threatScanner.js";
import { classifyJurisdiction } from "./metaNomos/jurisdictionClassifier.js";

function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function hasKeyword(text: string, needles: string[]): boolean {
  const t = normalize(text);
  return needles.some((k) => t.includes(normalize(k)));
}

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

  let mode: Mode = "DEFAULT";
  if (threat.rights_impact || threat.dual_use || threat.reconstruction_risk) mode = "GOVERNANCE";
  if (threat.architect_hint) mode = "ARCHITECT";

  const reason_code: ModeReasonCode =
    threat.architect_hint
      ? "ARCHITECT_KEYWORDS"
      : threat.reconstruction_risk
        ? "RECONSTRUCTION_RISK"
        : threat.dual_use
          ? "DUAL_USE"
          : threat.rights_impact
            ? "RIGHTS_IMPACT"
            : "DEFAULT_SAFE";

  return {
    mode,
    mode_reason: reason_code,
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
