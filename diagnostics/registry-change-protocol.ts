import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type DiffEntry = { status: string; file: string };
export type Comparison = { base: string; head: string };
const generatedStems: Record<string, string> = {
  invariants: "invariants", "failure-codes": "failureCodes", "decision-codes": "decisionCodes"
};
function must(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`registry-change-protocol: ${message}`);
}
function git(cwd: string, args: string[]): string {
  // Preserve a hook's alternate index in its own repo; isolate fixture repos.
  const env = { ...process.env };
  if (resolve(cwd) !== resolve(process.cwd())) {
    for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  }
  try { return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch { throw new Error(`registry-change-protocol: Git comparison failed (${args[0]}); required history may be unavailable`); }
}
function commit(cwd: string, ref: string): string {
  must(typeof ref === "string" && ref.length > 0 && !/^0+$/.test(ref), "a nonzero comparison revision is required");
  return git(cwd, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).trim();
}
function mergeBase(cwd: string, base: string, head: string): string {
  return git(cwd, ["merge-base", commit(cwd, base), commit(cwd, head)]).trim();
}

/** Select explicit endpoints; never silently fall back to a clean working tree in CI. */
export function comparisonForEnvironment(cwd: string, env: NodeJS.ProcessEnv): Comparison | undefined {
  if (env.REGISTRY_DIFF_BASE !== undefined || env.REGISTRY_DIFF_HEAD !== undefined) {
    must(env.REGISTRY_DIFF_BASE && env.REGISTRY_DIFF_HEAD, "set both REGISTRY_DIFF_BASE and REGISTRY_DIFF_HEAD");
    return { base: commit(cwd, env.REGISTRY_DIFF_BASE), head: commit(cwd, env.REGISTRY_DIFF_HEAD) };
  }
  if (!env.CI && !env.GITHUB_ACTIONS) return undefined;
  must(env.GITHUB_EVENT_PATH, "CI requires explicit comparison revisions or a supported GitHub event");
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  if (env.GITHUB_EVENT_NAME === "pull_request") {
    const head = commit(cwd, event.pull_request?.head?.sha);
    return { base: mergeBase(cwd, event.pull_request?.base?.sha, head), head };
  }
  if (env.GITHUB_EVENT_NAME === "push") {
    must(!event.deleted, "deleted branch has no comparison head");
    const head = commit(cwd, event.after);
    if (event.created && /^0+$/.test(event.before)) {
      const branch = event.repository?.default_branch;
      must(typeof branch === "string" && branch.length > 0, "new branch requires the default branch reference");
      const base = mergeBase(cwd, `refs/remotes/origin/${branch}`, head);
      must(base !== head, "new branch has no distinct default-branch base; run manually with an explicit base");
      return { base, head };
    }
    return { base: commit(cwd, event.before), head };
  }
  if (env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    return { base: commit(cwd, event.inputs?.base), head: commit(cwd, env.GITHUB_SHA!) };
  }
  throw new Error("registry-change-protocol: unsupported CI event; provide explicit comparison revisions");
}

function diff(cwd: string, args: string[]): DiffEntry[] {
  const fields = git(cwd, ["diff", "--no-ext-diff", "--no-renames", "--name-status", "-z", ...args, "--"]).split("\0");
  fields.pop();
  const entries: DiffEntry[] = [];
  for (let i = 0; i < fields.length; i += 2) entries.push({ status: fields[i], file: fields[i + 1] });
  return entries;
}
function validate(entries: DiffEntry[]): void {
  const registries = entries.filter(entry => /^schemas\/registries\/[^/]+\.v[0-9]+\.json$/.test(entry.file));
  must(registries.every(entry => entry.status === "A"),
    "versioned registry files are immutable; modifications, deletions, and renames are forbidden");
  if (!registries.length) return;
  const touched = (file: string) => entries.some(entry => entry.file === file && ["A", "M"].includes(entry.status));
  must(touched("schemas/registries/CHANGELOG.md"), "registry CHANGELOG.md must be updated for a new registry version");
  must(touched("runtime/registries/registryIndex.ts"), "registryIndex.ts must be updated for a new registry version");
  for (const entry of registries) {
    const match = /\/([^/]+)\.v([0-9]+)\.json$/.exec(entry.file)!;
    must(Object.hasOwn(generatedStems, match[1]), `unknown registry family ${match[1]}; add an explicit generated mapping`);
    const expected = `runtime/registries/generated/${generatedStems[match[1]]}.v${match[2]}.ts`;
    must(touched(expected), `missing matching generated registry ${expected}`);
  }
}

export function checkRegistryChanges(cwd: string, comparison?: Comparison) {
  if (comparison) {
    const entries = diff(cwd, [commit(cwd, comparison.base), commit(cwd, comparison.head)]);
    validate(entries);
    return { ok: true, changed: entries.length, mode: "committed" };
  }
  // Validate each independently: unstaged documentation cannot satisfy a staged addition.
  const staged = diff(cwd, ["--cached"]);
  const unstaged = diff(cwd, []);
  validate(staged);
  validate(unstaged);
  return { ok: true, changed: staged.length + unstaged.length, mode: "local" };
}
export async function run() {
  return checkRegistryChanges(process.cwd(), comparisonForEnvironment(process.cwd(), process.env));
}
