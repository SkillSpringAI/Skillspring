import crypto from "node:crypto";
import type { PipelineInput, ClassifiedContext, Mode, ModeReasonCode, TriggerHit } from "./types.js";

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

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
  const trigger_hits: TriggerHit[] = [];
  const text = input?.user_input ?? "";

  const rightsImpact = hasKeyword(text, ["legal advice", "visa appeal", "medical advice", "court", "lawsuit"]);

  const reconstructionRisk = hasKeyword(text, [
    "reconstruct",
    "recreate",
    "reverse engineer",
    "exact prompt",
    "partial details",
    "leak"
  ]);

  
  if (reconstructionRisk) {
    trigger_hits.push({ dataset: "risk-patterns/reconstruction-vectors", id: "RECONSTRUCTION_RISK", match: "keyword" });
  }
const dualUse = hasKeyword(text, [
    "weapon",
    "explosive",
    "malware",
    "phishing",
    "steal",
    "bypass",
    "jailbreak"
  ]);

  const architectHint = hasKeyword(text, ["system architect", "architecture", "governance", "invariant", "constitution"]);

  const dualUseFinal = dualUse || reconstructionRisk;

  
  if (dualUseFinal) {
    trigger_hits.push({ dataset: "risk-patterns/dual-use-patterns", id: "DUAL_USE", match: "keyword" });
  }
let mode: Mode = "DEFAULT";
  if (rightsImpact || dualUseFinal || reconstructionRisk) mode = "GOVERNANCE";
  if (architectHint) mode = "ARCHITECT";

  const reason_code: ModeReasonCode =
    architectHint
      ? "ARCHITECT_KEYWORDS"
      : reconstructionRisk
        ? "RECONSTRUCTION_RISK"
        : dualUseFinal
          ? "DUAL_USE"
          : rightsImpact
            ? "RIGHTS_IMPACT"
            : "DEFAULT_SAFE";
  return {
    mode,
    mode_reason: reason_code,
    domain_hints: [],
    trigger_hits,
    jurisdiction: { confidence: 0 },
    risk: {
      rights_impact: rightsImpact,
      dual_use: dualUseFinal,
      reconstruction_risk: reconstructionRisk,
      reason_code: reconstructionRisk ? "RECONSTRUCTION_RISK" : dualUseFinal ? "DUAL_USE" : rightsImpact ? "RIGHTS_IMPACT" : "NONE",
      confidence: clamp01((Number(rightsImpact) + Number(dualUseFinal) + Number(reconstructionRisk)) / 3)
    }
  };
}
