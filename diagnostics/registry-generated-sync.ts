import fs from "node:fs";
import path from "node:path";
import { createGeneratedRegistrySources } from "../scripts/generateRegistries.js";

function must(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

export async function run() {
  const repoRoot = process.cwd();
  const generated = createGeneratedRegistrySources(repoRoot);

  const mismatches: string[] = [];

  for (const g of generated) {
    const rel = path.relative(repoRoot, g.outputPath).replace(/\\/g, "/");
    const exists = fs.existsSync(g.outputPath);
    if (!exists) {
      mismatches.push(`${rel} (missing)`);
      continue;
    }

    const committed = normalize(fs.readFileSync(g.outputPath, "utf8"));
    const expected = normalize(g.content);

    if (committed !== expected) {
      mismatches.push(rel);
    }
  }

  must(
    mismatches.length === 0,
    "registry-generated-sync: committed generated registries are out of sync or tampered: " +
      mismatches.join(", ") +
      ". Run npm run gen:registries and commit outputs."
  );

  return { ok: true, checked: generated.length };
}
