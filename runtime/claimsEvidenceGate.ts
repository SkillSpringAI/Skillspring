import type { EvidenceStatus } from "./types.js";

export type ClaimEvidenceItem = {
  item: string;
  status: EvidenceStatus;
};

export type ClaimsEvidenceResult = {
  evidence: ClaimEvidenceItem[];
};

export function evaluateClaimsEvidence(userInput: string): ClaimsEvidenceResult {
  const text = (userInput ?? "").trim();

  if (!text) {
    return {
      evidence: [
        { item: "User input content", status: "UNKNOWN" }
      ]
    };
  }

  // Minimal Phase 1 gate:
  // Only classify directly available input evidence.
  // Later phases can add claim extraction and evidence derivation rules.
  return {
    evidence: [
      { item: "User input content", status: "PROVIDED" }
    ]
  };
}
