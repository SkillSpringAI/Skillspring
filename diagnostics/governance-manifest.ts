import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import manifestSchema from "../schemas/governance/governance-manifest.schema.json";
import { createGovernanceManifest, renderGeneratedManifestModule } from "../scripts/generateGovernanceManifest.js";
import { runGovernedPipeline } from "../runtime/pipeline.js";

export function checkGovernanceManifest(): void {
  const repoRoot = process.cwd();
  const manifestPath = path.resolve(repoRoot, "schemas/governance/governance-manifest.json");
  const committed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const validate = new Ajv({ strict: true }).compile(manifestSchema as any);
  assert.equal(validate(committed), true, `governance manifest schema invalid: ${JSON.stringify(validate.errors)}`);
  assert.deepEqual(committed, createGovernanceManifest(repoRoot), "governance manifest is stale; run npm run gen:governance-manifest");
  const generated = fs.readFileSync(path.resolve(repoRoot, "runtime/governance/generated.ts"), "utf8");
  assert.equal(generated, renderGeneratedManifestModule(committed), "generated runtime manifest is stale; run npm run gen:governance-manifest");
}

export async function checkGovernedResultManifestBinding(): Promise<void> {
  const result = await runGovernedPipeline({ user_input: "Give a short definition of governance." });
  const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "schemas/governance/governance-manifest.json"), "utf8"));
  assert.equal(result.policy.governance_manifest_id, manifest.manifest_id, "governed result is not bound to the committed manifest");
}

if (process.argv[1] && /governance-manifest\.(ts|js)$/.test(process.argv[1])) {
  checkGovernanceManifest();
  checkGovernedResultManifestBinding().then(() => console.log("DIAG governance-manifest: PASS")).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
