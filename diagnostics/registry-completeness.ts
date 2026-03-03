import fs from "node:fs";
import path from "node:path";
import { FAILURE_CODES_V1 } from "../runtime/registries/generated/failureCodes.v1";
import { INVARIANTS_V1 } from "../runtime/registries/generated/invariants.v1";

function must(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

function stripComments(text: string): string {
  // Remove block comments and line comments (good enough for diagnostics)
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const noLine = noBlock.replace(/\/\/.*$/gm, "");
  return noLine;
}

function collectMatches(root: string, rx: RegExp): Set<string> {
  const hits = new Set<string>();

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(full);
      } else if (entry.isFile() && full.endsWith(".ts")) {
        const text = stripComments(fs.readFileSync(full, "utf8"));
        let m: RegExpExecArray | null;
        while ((m = rx.exec(text))) hits.add(m[0]);
      }
    }
  }

  walk(root);
  return hits;
}

export async function run() {
  const repoRoot = process.cwd();

  // Failure codes like LG-H-001, DIAG-H-001
  const failureRx = /\b[A-Z]{2,8}-(H|S|A)-[0-9]{3}\b/g;
  // Invariant ids like INV-031
  const invRx = /\bINV-[0-9]{3}\b/g;

  const foundFailureCodes = collectMatches(repoRoot, failureRx);
  const foundInvariantIds = collectMatches(repoRoot, invRx);

  const registeredFailure = new Set(FAILURE_CODES_V1.codes.map((c) => c.code));
  const registeredInv = new Set(INVARIANTS_V1.invariants.map((i) => i.invariant_id));

  for (const code of foundFailureCodes) {
    must(registeredFailure.has(code), `registry-completeness: failure_code not registered: ${code}`);
  }

  for (const id of foundInvariantIds) {
    must(registeredInv.has(id), `registry-completeness: invariant_id not registered: ${id}`);
  }

  return {
    ok: true,
    checked_failure_codes: foundFailureCodes.size,
    checked_invariant_ids: foundInvariantIds.size,
    registered_failure_codes: registeredFailure.size,
    registered_invariant_ids: registeredInv.size
  };
}
