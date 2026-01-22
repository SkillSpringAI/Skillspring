import crypto from "node:crypto";
import type { ClassifiedContext, Mode, PipelineInput } from "./types.js";

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeUserInput(raw: unknown): string {
  const s = String(raw ?? "");
  return s
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasKeyword(normalizedInput: string, words: string[]): boolean {
  return words.some((w) => normalizedInput.includes(w));
}

export function makeTraceId(seed: unknown): string {
  const norm = normalizeUserInput(seed);
  const h = crypto.createHash("sha256").update(norm).digest("hex");
  return h.slice(0, 24);
}

export function classify(input: PipelineInput): ClassifiedContext {
  const text = normalizeUserInput(input.user_input);

  const architectHint = hasKeyword(text, ["system architect", "constitution", "invariant"]);

  const rightsImpact = hasKeyword(text, [
    "medical",
    "diagnosis",
    "legal",
    "visa",
    "immigration",
    "child",
    "criminal",
    "finance",
    "loan"
  ]);

  const dualUse = hasKeyword(text, [
    "weapon",
    "explosive",
    "harm",
    "poison",
    "malware",
    "hack",
    "bypass",
    "fraud"
  ]);

  const reconstructionRisk = hasKeyword(text, [
    "reconstruct",
    "recreate",
    "reverse engineer",
    "exact prompt",
    "partial details",
    "leak",
    "private key",
    "credentials"
  ]);

  const dualUseFinal = dualUse || reconstructionRisk;

  let mode: Mode = "DEFAULT";
  if (rightsImpact || dualUseFinal || reconstructionRisk) mode = "GOVERNANCE";
  if (architectHint) mode = "ARCHITECT";

  const reason_code =
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
    jurisdiction: { confidence: 0 },
    risk: {
      rights_impact: rightsImpact,
      dual_use: dualUseFinal,
      reconstruction_risk: reconstructionRisk,
      reason_code:
        reconstructionRisk ? "RECONSTRUCTION_RISK" : dualUseFinal ? "DUAL_USE" : rightsImpact ? "RIGHTS_IMPACT" : "NONE",
      confidence: clamp01(
        (Number(rightsImpact) + Number(dualUseFinal) + Number(reconstructionRisk)) / 3
      )
    }
  };
}
