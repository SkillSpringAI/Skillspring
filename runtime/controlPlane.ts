import crypto from "node:crypto";
import type { ClassifiedContext, Mode, PipelineInput } from "./types.ts";

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function hasKeyword(input: string, words: string[]): boolean {
  const t = input.toLowerCase();
  return words.some((w) => t.includes(w));
}

export function makeTraceId(seed: string): string {
  const h = crypto.createHash("sha256").update(seed).digest("hex");
  return h.slice(0, 24);
}

export function classify(input: PipelineInput): ClassifiedContext {
  const text = input.user_input;

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
    "recreate",
    "reverse engineer",
    "exact prompt",
    "leak",
    "private key",
    "credentials"
  ]);

  let mode: Mode = "DEFAULT";
  if (rightsImpact || dualUse || reconstructionRisk) mode = "GOVERNANCE";
  if (hasKeyword(text, ["system architect", "constitution", "invariant"])) {
    mode = "ARCHITECT";
  }

  return {
    mode,
    domain_hints: [],
    jurisdiction: { confidence: 0 },
    risk: {
      rights_impact: rightsImpact,
      dual_use: dualUse,
      reconstruction_risk: reconstructionRisk,
      confidence: clamp01(
        (Number(rightsImpact) + Number(dualUse) + Number(reconstructionRisk)) / 3
      )
    }
  };
}
