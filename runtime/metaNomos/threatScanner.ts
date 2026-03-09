import type { TriggerHit } from "../types.js";

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

function dedupeTriggerHits(hits: TriggerHit[]): TriggerHit[] {
  const seen = new Set<string>();
  const out: TriggerHit[] = [];

  for (const h of hits) {
    const key = `${h.dataset}:${h.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }

  return out;
}

export type ThreatScanResult = {
  rights_impact: boolean;
  dual_use: boolean;
  reconstruction_risk: boolean;
  architect_hint: boolean;
  trigger_hits: readonly TriggerHit[];
  reason_code: "RECONSTRUCTION_RISK" | "DUAL_USE" | "RIGHTS_IMPACT" | "NONE";
  confidence: number;
};

export function scanThreats(text: string): ThreatScanResult {
  const trigger_hits: TriggerHit[] = [];

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

  return {
    rights_impact: rightsImpact,
    dual_use: dualUseFinal,
    reconstruction_risk: reconstructionRisk,
    architect_hint: architectHint,
    trigger_hits: dedupeTriggerHits(trigger_hits),
    reason_code: reconstructionRisk ? "RECONSTRUCTION_RISK" : dualUseFinal ? "DUAL_USE" : rightsImpact ? "RIGHTS_IMPACT" : "NONE",
    confidence: clamp01((Number(rightsImpact) + Number(dualUseFinal) + Number(reconstructionRisk)) / 3)
  };
}
