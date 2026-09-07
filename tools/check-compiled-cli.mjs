import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/src/cli.js", import.meta.url));
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: tmpdir(), encoding: "utf8", timeout: 15000
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}
const allowed = run(["Explain governance."]);
assert.equal(allowed.status, 0, allowed.stderr);
const answer = JSON.parse(allowed.stdout);
assert.equal(answer.ok, true);
assert.equal(answer.response.type, "SAFE_STUB");
assert.match(answer.policy.governance_manifest_id, /^sha256:[a-f0-9]{64}$/);
const refused = run(["malware"]);
assert.equal(refused.status, 0, refused.stderr);
const refusal = JSON.parse(refused.stdout);
assert.equal(refusal.ok, false);
assert.equal(refusal.policy.decision, "REFUSE");
assert.equal(typeof refusal.refusal.failure_code, "string");
assert.equal(refusal.response, undefined);
const empty = run([]);
assert.equal(empty.status, 2);
assert.match(empty.stderr, /No input provided/);
console.log("Compiled CLI: PASS (allow, refuse, missing input; external working directory)");
