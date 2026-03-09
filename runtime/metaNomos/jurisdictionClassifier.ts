export type JurisdictionGuess = {
  guess?: string;
  confidence: number;
};

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

export function classifyJurisdiction(text: string): JurisdictionGuess {
  if (!text || text.trim() === "") {
    return { confidence: 0 };
  }

  // Minimal deterministic heuristic only.
  // This module must not emit threat/risk fields.
  if (hasKeyword(text, ["new zealand", "nz", "auckland", "wellington"])) {
    return { guess: "NZ", confidence: 0.6 };
  }

  if (hasKeyword(text, ["united states", "usa", "u.s.", "new york", "california"])) {
    return { guess: "US", confidence: 0.6 };
  }

  if (hasKeyword(text, ["united kingdom", "uk", "london", "england"])) {
    return { guess: "UK", confidence: 0.6 };
  }

  return { confidence: 0 };
}
