import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import registrySchema from "../schemas/registries/decision-codes.schema.json";

type CodeRegistry = {
  codes: Array<{ code: string }>;
  refusal_codes: string[];
};

function collectRuntimeLiterals(repoRoot: string): Set<string> {
  const found = new Set<string>();
  const runtimeRoot = path.resolve(repoRoot, "runtime");
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.name.endsWith(".ts") && !fullPath.includes(`${path.sep}generated${path.sep}`)) files.push(fullPath);
    }
  };
  visit(runtimeRoot);
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/"(ALLOW_[A-Z0-9_]+|REFUSE_[A-Z0-9_]+|REFUSE-[A-Z0-9-]+)"/g)) found.add(match[1]);
  }
  return found;
}

export function checkPolicyCodeRegistry(): void {
  const repoRoot = process.cwd();
  const registry = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "schemas/registries/decision-codes.v1.json"), "utf8")) as CodeRegistry;
  const valid = new Ajv({ strict: true }).compile(registrySchema as any);
  assert.equal(valid(registry), true, `decision-code registry schema invalid: ${JSON.stringify(valid.errors)}`);
  const declared = new Set([...registry.codes.map((entry) => entry.code), ...registry.refusal_codes]);
  const literals = collectRuntimeLiterals(repoRoot);
  const unknown = [...literals].filter((code) => !declared.has(code));
  assert.deepEqual(unknown, [], `runtime emitted codes missing from decision registry: ${unknown.join(", ")}`);
  assert.equal(new Set(registry.codes.map((entry) => entry.code)).size, registry.codes.length, "duplicate decision code");
  assert.equal(new Set(registry.refusal_codes).size, registry.refusal_codes.length, "duplicate refusal code");
}

if (process.argv[1] && /policy-code-registry\.(ts|js)$/.test(process.argv[1])) {
  checkPolicyCodeRegistry();
  console.log("DIAG policy-code-registry: PASS");
}
