import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, relative, isAbsolute } from "node:path";
import { checkRegistryChanges, comparisonForEnvironment } from "./registry-change-protocol.js";

export function checkRegistryChangeProtocolTests() {
  const tempRoot = realpathSync(tmpdir());
  const root = mkdtempSync(join(tempRoot, "skillspring-registry-tests-"));
  // Git hooks export repository variables; never let fixtures operate on the caller's index.
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args,
    { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (cwd: string, path: string, text = "fixture\n") => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  const oldRegistry = "schemas/registries/invariants.v1.json";
  const newRegistry = "schemas/registries/invariants.v2.json";
  const changelog = "schemas/registries/CHANGELOG.md";
  const index = "runtime/registries/registryIndex.ts";
  const generated = "runtime/registries/generated/invariants.v2.ts";
  let count = 0;
  const fixture = () => {
    const cwd = join(root, String(count++));
    mkdirSync(cwd);
    git(cwd, "init", "--initial-branch=main");
    git(cwd, "config", "user.name", "Registry diagnostic");
    git(cwd, "config", "user.email", "diagnostic@example.invalid");
    git(cwd, "config", "core.hooksPath", join(root, "no-hooks"));
    git(cwd, "config", "commit.gpgsign", "false");
    write(cwd, oldRegistry, "{}\n"); write(cwd, changelog); write(cwd, index);
    git(cwd, "add", "."); git(cwd, "commit", "-m", "baseline");
    return { cwd, base: git(cwd, "rev-parse", "HEAD") };
  };
  const addition = (cwd: string, omit?: string) => {
    for (const path of [newRegistry, changelog, index, generated]) {
      if (path !== omit) write(cwd, path, "new version\n");
    }
  };
  const save = (cwd: string) => {
    git(cwd, "add", "."); git(cwd, "commit", "-m", "change");
    assert.equal(git(cwd, "status", "--porcelain"), "");
    return git(cwd, "rev-parse", "HEAD");
  };
  try {
    for (const action of ["modify", "delete", "rename"] as const) {
      const { cwd, base } = fixture();
      if (action === "modify") write(cwd, oldRegistry, "changed\n");
      else if (action === "delete") git(cwd, "rm", oldRegistry);
      else git(cwd, "mv", oldRegistry, newRegistry);
      const head = save(cwd);
      assert.throws(() => checkRegistryChanges(cwd, { base, head }), /immutable/);
    }
    for (const [omit, expected] of [[changelog, /CHANGELOG/], [index, /registryIndex/],
      [generated, /matching generated/]] as const) {
      const { cwd, base } = fixture(); addition(cwd, omit);
      assert.throws(() => checkRegistryChanges(cwd, { base, head: save(cwd) }), expected);
    }
    {
      const { cwd, base } = fixture(); addition(cwd, generated);
      write(cwd, "runtime/registries/generated/failureCodes.v2.ts");
      assert.throws(() => checkRegistryChanges(cwd, { base, head: save(cwd) }), /invariants.v2.ts/);
    }
    {
      const { cwd, base } = fixture(); addition(cwd);
      git(cwd, "add", ".");
      assert.equal(checkRegistryChanges(cwd).ok, true);
      const head = save(cwd);
      assert.equal(checkRegistryChanges(cwd, { base, head }).mode, "committed");
      assert.throws(() => checkRegistryChanges(cwd, { base: "missing-ref", head }), /history may be unavailable/);
      assert.throws(() => checkRegistryChanges(cwd, { base, head: "missing-ref" }), /history may be unavailable/);
      assert.equal(checkRegistryChanges(cwd, { base: head, head }).changed, 0);
      const eventPath = join(root, "event.json");
      const event = (name: string, payload: unknown) => {
        writeFileSync(eventPath, JSON.stringify(payload));
        return comparisonForEnvironment(cwd, { CI: "true", GITHUB_EVENT_NAME: name, GITHUB_EVENT_PATH: eventPath, GITHUB_SHA: head });
      };
      assert.deepEqual(event("push", { before: base, after: head }), { base, head });
      git(cwd, "update-ref", "refs/remotes/origin/main", base);
      assert.deepEqual(event("push", { created: true, before: "0".repeat(40), after: head,
        repository: { default_branch: "main" } }), { base, head });
      assert.deepEqual(event("pull_request", { pull_request: { base: { sha: base }, head: { sha: head } } }), { base, head });
      git(cwd, "checkout", "-b", "advanced-base", base);
      write(cwd, "base-only.txt");
      const advancedBase = save(cwd);
      assert.deepEqual(event("pull_request", { pull_request: { base: { sha: advancedBase }, head: { sha: head } } }), { base, head });
      assert.deepEqual(event("workflow_dispatch", { inputs: { base } }), { base, head });
      assert.throws(() => event("workflow_dispatch", {}), /revision is required/);
      assert.throws(() => event("push", { before: "0".repeat(40), after: head }), /revision is required/);
      assert.throws(() => event("push", { created: true, before: "0".repeat(40), after: head,
        repository: { default_branch: "missing" } }), /history may be unavailable/);
      git(cwd, "update-ref", "refs/remotes/origin/main", head);
      assert.throws(() => event("push", { created: true, before: "0".repeat(40), after: head,
        repository: { default_branch: "main" } }), /distinct default-branch base/);
      assert.throws(() => comparisonForEnvironment(cwd, { CI: "true" }), /CI requires/);
      assert.throws(() => event("schedule", {}), /unsupported CI event/);
      assert.throws(() => event("push", { deleted: true }), /deleted branch/);
      assert.throws(() => comparisonForEnvironment(cwd, { REGISTRY_DIFF_BASE: base }), /set both/);
      assert.deepEqual(comparisonForEnvironment(cwd, { CI: "true", REGISTRY_DIFF_BASE: base, REGISTRY_DIFF_HEAD: head }), { base, head });
    }
    {
      const { cwd } = fixture(); addition(cwd);
      git(cwd, "add", newRegistry, generated, index);
      assert.throws(() => checkRegistryChanges(cwd), /CHANGELOG/);
      git(cwd, "add", changelog);
      assert.equal(checkRegistryChanges(cwd).ok, true);
      write(cwd, oldRegistry, "unstaged mutation\n");
      assert.throws(() => checkRegistryChanges(cwd), /immutable/);
    }
    {
      const { cwd, base } = fixture();
      write(cwd, "schemas/registries/unknown.v2.json");
      write(cwd, changelog, "change\n"); write(cwd, index, "change\n");
      write(cwd, "runtime/registries/generated/unknown.v2.ts");
      assert.throws(() => checkRegistryChanges(cwd, { base, head: save(cwd) }), /unknown registry family/);
    }
  } finally {
    const target = realpathSync(root);
    const within = relative(tempRoot, target);
    assert.ok(within && !within.startsWith("..") && !isAbsolute(within));
    rmSync(target, { recursive: true, force: true });
  }
}
