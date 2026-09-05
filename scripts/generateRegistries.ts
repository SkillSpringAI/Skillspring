import fs from "node:fs";
import path from "node:path";

type GeneratedFile = {
  outputPath: string;
  content: string;
};

function readJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as T;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function renderGeneratedModule(opts: {
  importType: string;
  importFrom: string;
  constName: string;
  sourceJsonPath: string;
  payload: unknown;
}): string {
  return [
    `import type { ${opts.importType} } from \"${opts.importFrom}\";`,
    "",
    "/**",
    ` * GENERATED (committed). Source of truth remains ${opts.sourceJsonPath}`,
    " * Runtime must be filesystem-free; validation happens in diagnostics.",
    " */",
    `export const ${opts.constName}: ${opts.importType} = ${stableJson(opts.payload)};`,
    ""
  ].join("\n");
}

export function createGeneratedRegistrySources(repoRoot: string): GeneratedFile[] {
  const invariantsJsonPath = path.resolve(repoRoot, "schemas/registries/invariants.v2.json");
  const failureCodesJsonPath = path.resolve(repoRoot, "schemas/registries/failure-codes.v2.json");

  const invariants = readJson<unknown>(invariantsJsonPath);
  const failureCodes = readJson<unknown>(failureCodesJsonPath);
  const decisionCodes = readJson<unknown>(path.resolve(repoRoot, "schemas/registries/decision-codes.v1.json"));

  const invariantsTs = renderGeneratedModule({
    importType: "InvariantRegistryV1",
    importFrom: "../invariants",
    constName: "INVARIANTS_V2",
    sourceJsonPath: "schemas/registries/invariants.v2.json",
    payload: invariants
  });

  const failureCodesTs = renderGeneratedModule({
    importType: "FailureCodeRegistryV1",
    importFrom: "../failureCodes",
    constName: "FAILURE_CODES_V2",
    sourceJsonPath: "schemas/registries/failure-codes.v2.json",
    payload: failureCodes
  });

  return [
    {
      outputPath: path.resolve(repoRoot, "runtime/registries/generated/decisionCodes.v1.ts"),
      content: [
        "/** GENERATED. Source: schemas/registries/decision-codes.v1.json. */",
        `export const DECISION_CODES_V1 = ${stableJson(decisionCodes)} as const;`,
        ""
      ].join("\n")
    },
    {
      outputPath: path.resolve(repoRoot, "runtime/registries/generated/invariants.v2.ts"),
      content: invariantsTs
    },
    {
      outputPath: path.resolve(repoRoot, "runtime/registries/generated/failureCodes.v2.ts"),
      content: failureCodesTs
    }
  ];
}

export function writeGeneratedRegistries(repoRoot: string): string[] {
  const generated = createGeneratedRegistrySources(repoRoot);
  for (const file of generated) {
    fs.mkdirSync(path.dirname(file.outputPath), { recursive: true });
    fs.writeFileSync(file.outputPath, file.content, "utf8");
  }
  return generated.map((f) => f.outputPath);
}

if (process.argv[1] && /generateRegistries\.(ts|js)$/.test(process.argv[1])) {
  const repoRoot = process.cwd();
  const written = writeGeneratedRegistries(repoRoot);
  for (const p of written) console.log(`generated: ${path.relative(repoRoot, p).replace(/\\/g, "/")}`);
}
