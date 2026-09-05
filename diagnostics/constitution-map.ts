import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export function checkConstitutionMap(): void {
  const repoRoot = process.cwd();
  const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8").replace(/^\uFEFF/, ""));
  const invariants = readJson("schemas/registries/invariants.v2.json");
  const map = readJson("schemas/registries/invariant-implementation-map.json");
  const byId = new Map<string, any>(map.mappings.map((entry: any) => [entry.invariant_id, entry]));
  for (const invariant of invariants.invariants) {
    const entry = byId.get(invariant.invariant_id);
    assert.ok(entry, `missing constitution map entry for ${invariant.invariant_id}`);
    assert.ok(["current", "partial", "planned"].includes(entry.enforcement), `invalid enforcement status for ${invariant.invariant_id}`);
    for (const relativePath of [...entry.implementation, ...entry.diagnostics]) {
      assert.ok(fs.existsSync(path.resolve(repoRoot, relativePath)), `constitution map path does not exist: ${relativePath}`);
    }
  }
}

if (process.argv[1] && /constitution-map\.(ts|js)$/.test(process.argv[1])) {
  checkConstitutionMap();
  console.log("DIAG constitution-map: PASS");
}
