import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type VersionedHash = { version: string; hash: string };

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function sha256(value: string): string {
  return `sha256:${crypto.createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function hashFile(repoRoot: string, relativePath: string): string {
  return sha256(fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8"));
}

function hashDirectory(repoRoot: string, relativeDirectory: string): string {
  const directory = path.resolve(repoRoot, relativeDirectory);
  const files = fs.readdirSync(directory)
    .filter((name) => name.endsWith(".md"))
    .sort();
  const content = files.map((name) => `${name}\n${fs.readFileSync(path.join(directory, name), "utf8")}`).join("\n");
  return sha256(content);
}

function versionedHash(repoRoot: string, relativePath: string, version: string): VersionedHash {
  return { version, hash: hashFile(repoRoot, relativePath) };
}

export function createGovernanceManifest(repoRoot: string): any {
  const base = {
    schema_version: "skillspring.governance-manifest.v1",
    constitution: { version: "1.0", hash: hashDirectory(repoRoot, "constitution") },
    registries: {
      triggers: versionedHash(repoRoot, "schemas/triggers/trigger-registry.json", "1.0.0"),
      modes: versionedHash(repoRoot, "schemas/modes/mode-registry.json", "1.0.0"),
      cycles: versionedHash(repoRoot, "schemas/cycles/cycle-registry.json", "1.0.0"),
      invariants: versionedHash(repoRoot, "schemas/registries/invariants.v2.json", "v2"),
      failure_codes: versionedHash(repoRoot, "schemas/registries/failure-codes.v2.json", "v2"),
      decision_codes: versionedHash(repoRoot, "schemas/registries/decision-codes.v1.json", "v1")
    },
    schemas: {
      generated_answer_candidate: versionedHash(repoRoot, "schemas/outputs/generated-answer-candidate.v1.schema.json", "v1"),
      evaluate_request: versionedHash(repoRoot, "schemas/api/evaluate-request.v1.schema.json", "v1"),
      evaluate_response: versionedHash(repoRoot, "schemas/api/evaluate-response.v1.schema.json", "v1"),
      output: versionedHash(repoRoot, "schemas/output.schema.json", "1.0.0"),
      output_admissibility: versionedHash(repoRoot, "schemas/outputs/output-admissibility.schema.json", "1.0.0"),
      dla: versionedHash(repoRoot, "schemas/authority/decision-legitimacy-artifact.schema.json", "1.0.0"),
      permission_token: versionedHash(repoRoot, "schemas/authority/permission-token.schema.json", "1.0.0"),
      execution_authority: versionedHash(repoRoot, "schemas/authority/execution-authority.schema.json", "1.0.0")
    },
    datasets: {
      dual_use: versionedHash(repoRoot, "datasets/risk-patterns/dual-use-patterns.json", "v1"),
      reconstruction: versionedHash(repoRoot, "datasets/risk-patterns/reconstruction-vectors.json", "v1")
    }
  };

  const manifestWithoutId = JSON.stringify(base);
  return { ...base, manifest_id: sha256(manifestWithoutId) };
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function writeGovernanceManifest(repoRoot: string): string[] {
  const manifest = createGovernanceManifest(repoRoot);
  const jsonPath = path.resolve(repoRoot, "schemas/governance/governance-manifest.json");
  const tsPath = path.resolve(repoRoot, "runtime/governance/generated.ts");
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(tsPath), { recursive: true });
  fs.writeFileSync(jsonPath, stableJson(manifest), "utf8");
  fs.writeFileSync(tsPath, renderGeneratedManifestModule(manifest), "utf8");
  return [jsonPath, tsPath];
}

export function renderGeneratedManifestModule(manifest: unknown): string {
  return `/** GENERATED. Source of truth remains schemas/governance/governance-manifest.json. */\nexport const GOVERNANCE_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const;\n`;
}

if (process.argv[1] && /generateGovernanceManifest\.(ts|js)$/.test(process.argv[1])) {
  for (const file of writeGovernanceManifest(process.cwd())) {
    console.log(`generated: ${path.relative(process.cwd(), file).replace(/\\/g, "/")}`);
  }
}
