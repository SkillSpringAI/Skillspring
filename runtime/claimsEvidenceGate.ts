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

  const inputStatus: EvidenceStatus = text ? "PROVIDED" : "UNKNOWN";

  // Claims–Evidence Gate v2:
  // Build the baseline governance evidence spine.
  const evidence: ClaimEvidenceItem[] = [
    { item: "User input content", status: inputStatus },
    { item: "Jurisdiction", status: "ASSUMED" },
    { item: "Domain classification", status: "ASSUMED" }
  ];

  return { evidence };
}
