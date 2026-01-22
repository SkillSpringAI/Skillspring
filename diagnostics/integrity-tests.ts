/**
 * Diagnostic: Dataset Integrity
 * Purpose: Ensure required datasets exist, are valid JSON, and declare versions.
 */

import { readFileSync, existsSync } from "node:fs";

const requiredDatasets = [
  "datasets/regulatory/ai-regimes.json",
  "datasets/risk-patterns/dual-use-patterns.json",
  "datasets/risk-patterns/reconstruction-vectors.json",
  "datasets/evaluation/test-prompts.json"
];

function mustHaveBaseFields(obj: any, path: string) {
  if (!obj || typeof obj !== "object") throw new Error(`Dataset invalid JSON object: ${path}`);
  if (typeof obj.version !== "string" || obj.version.trim().length === 0) {
    throw new Error(`Dataset missing 'version' string: ${path}`);
  }
  if (typeof obj.updated_at !== "string" || obj.updated_at.trim().length === 0) {
    throw new Error(`Dataset missing 'updated_at' string: ${path}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(obj.updated_at)) {
    throw new Error(`Dataset 'updated_at' must be YYYY-MM-DD: ${path}`);
  }
}

function assertUniqueStrings(arr: any[], path: string, field: string) {
  const norm = arr.map((s) => String(s).trim());
  const set = new Set(norm);
  if (set.size !== norm.length) throw new Error(`Dataset '${field}' contains duplicates: ${path}`);
}

function assertMinLen(arr: string[], path: string, field: string, minLen: number) {
  const bad = arr.find((s) => s.trim().length < minLen);
  if (bad) throw new Error(`Dataset '${field}' has too-short entry (<${minLen} chars): ${path} :: "${bad}"`);
}

export function checkDatasetIntegrity(): void {
  for (const path of requiredDatasets) {
    if (!existsSync(path)) throw new Error(`Missing required dataset: ${path}`);

    let parsed: any;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw new Error(`Dataset not valid JSON: ${path}`);
    }

    mustHaveBaseFields(parsed, path);

    // Minimum structure expectations by dataset type
    if (path.includes("dual-use-patterns.json") || path.includes("reconstruction-vectors.json")) {
      if (!Array.isArray(parsed.patterns) || parsed.patterns.length === 0) {
        throw new Error(`Dataset missing non-empty 'patterns' array: ${path}`);
      }
      if (!parsed.patterns.every((p: any) => typeof p === "string" && p.trim().length > 0)) {
        throw new Error(`Dataset 'patterns' must be non-empty strings: ${path}`);
      }

      assertUniqueStrings(parsed.patterns, path, "patterns");
      assertMinLen(parsed.patterns, path, "patterns", 12);
    }

    if (path.includes("test-prompts.json")) {
      if (!Array.isArray(parsed.prompts) || parsed.prompts.length === 0) {
        throw new Error(`Dataset missing non-empty 'prompts' array: ${path}`);
      }
      if (!parsed.prompts.every((p: any) => typeof p === "string" && p.trim().length > 0)) {
        throw new Error(`Dataset 'prompts' must be non-empty strings: ${path}`);
      }
      assertUniqueStrings(parsed.prompts, path, "prompts");
    }

    if (path.includes("ai-regimes.json")) {
      if (!("regimes" in parsed)) throw new Error(`Dataset missing 'regimes' field: ${path}`);
      if (!Array.isArray(parsed.regimes)) throw new Error(`Dataset 'regimes' must be an array: ${path}`);
    }
  }

  console.log("DIAG integrity: PASS");
}
