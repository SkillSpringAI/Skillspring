import { execSync } from "node:child_process";

function must(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

type DiffEntry = { status: string; file: string };

function gitDiffNameStatus(args: string[]): DiffEntry[] {
  const out = execSync(["git", "diff", "--name-status", ...args].join(" "), { encoding: "utf8" }).trim();
  if (!out) return [];
  return out.split("\n").map((line) => {
    const [status, ...rest] = line.trim().split(/\s+/);
    return { status, file: rest.join(" ") };
  });
}

function isVersionedRegistryJson(p: string): boolean {
  // Match: schemas/registries/<name>.vN.json (not schema.json)
  return /^schemas\/registries\/.+\.v[0-9]+\.json$/i.test(p.replace(/\\/g, "/"));
}

function isGeneratedRegistryTs(p: string): boolean {
  // Match: runtime/registries/generated/<name>.vN.ts
  return /^runtime\/registries\/generated\/.+\.v[0-9]+\.ts$/i.test(p.replace(/\\/g, "/"));
}

function norm(p: string): string {
  return p.replace(/\\/g, "/");
}

function parseVersionedName(p: string): { stem: string; v: number } | null {
  const n = norm(p);
  const m = /\/([^\/]+)\.v([0-9]+)\.(json|ts)$/i.exec(n);
  if (!m) return null;
  return { stem: m[1], v: parseInt(m[2], 10) };
}

export async function run() {
  // Check both staged and unstaged changes
  const unstaged = gitDiffNameStatus([]);
  const staged = gitDiffNameStatus(["--cached"]);
  const diff = [...unstaged, ...staged];

  // If nothing changed, pass
  if (diff.length === 0) return { ok: true, changed: 0 };

  const modifiedVersioned = diff.filter((d) => d.status === "M" && isVersionedRegistryJson(d.file));
  must(
    modifiedVersioned.length === 0,
    "registry-change-protocol: versioned registry files are immutable. Do not modify existing *.vN.json. Create a new version file instead. Offenders: " +
      modifiedVersioned.map((d) => norm(d.file)).join(", ")
  );

  const addedVersioned = diff.filter((d) => d.status === "A" && isVersionedRegistryJson(d.file));

  // If no new versioned registry added, nothing to enforce beyond immutability
  if (addedVersioned.length === 0) return { ok: true, changed: diff.length };

  // Enforce: changelog updated
  const changelogTouched = diff.some((d) => norm(d.file) === "schemas/registries/CHANGELOG.md" && (d.status === "M" || d.status === "A"));
  must(changelogTouched, "registry-change-protocol: registry CHANGELOG.md must be updated when adding a new registry version.");

  // Enforce: registryIndex touched
  const registryIndexTouched = diff.some((d) => norm(d.file) === "runtime/registries/registryIndex.ts" && d.status === "M");
  must(registryIndexTouched, "registry-change-protocol: runtime/registries/registryIndex.ts must be updated to point to the new latest registry versions.");

  // Enforce: each added json version has a matching generated TS version added (or modified if already existed)
  const genTouched = diff.filter((d) => isGeneratedRegistryTs(d.file) && (d.status === "A" || d.status === "M"));
  const genKeys = new Set(genTouched.map((d) => {
    const pv = parseVersionedName(d.file);
    return pv ? `${pv.stem}.v${pv.v}` : "";
  }).filter(Boolean));

  for (const a of addedVersioned) {
    const pv = parseVersionedName(a.file);
    must(!!pv, `registry-change-protocol: could not parse versioned registry name: ${a.file}`);
    // mapping stems: failure-codes -> failureCodes, invariants -> invariants (generated naming differs)
    // We accept any generated TS file with matching ".vN" for this version.
    const expectedKey = `v${pv!.v}`;
    const hasAnyMatchingVersion = Array.from(genKeys).some((k) => k.endsWith(`.v${pv!.v}`) || k.includes(`v${pv!.v}`));
    must(
      hasAnyMatchingVersion,
      `registry-change-protocol: added ${norm(a.file)} but no matching generated runtime registry *.v${pv!.v}.ts was added/updated in runtime/registries/generated.`
    );
  }

  return { ok: true, added_versions: addedVersioned.map((d) => norm(d.file)) };
}
