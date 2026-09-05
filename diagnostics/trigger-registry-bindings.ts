import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export function checkTriggerRegistryBindings(): void {
  const repoRoot = process.cwd();
  const registry = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "schemas/triggers/trigger-registry.json"), "utf8"));
  const ids = new Set<string>();
  for (const trigger of registry.triggers) {
    assert.ok(!ids.has(trigger.id), `duplicate trigger id: ${trigger.id}`);
    ids.add(trigger.id);
    for (const field of ["status", "activation_source", "associated_invariant", "audit_requirement", "implementation_binding", "diagnostic_binding"]) {
      assert.equal(typeof trigger[field], "string", `${trigger.id} missing ${field}`);
    }
    assert.ok(Array.isArray(trigger.allowed_mode_influence) && trigger.allowed_mode_influence.length > 0, `${trigger.id} missing allowed mode influence`);
    for (const relativePath of [trigger.implementation_binding, trigger.diagnostic_binding]) {
      assert.ok(fs.existsSync(path.resolve(repoRoot, relativePath)), `${trigger.id} binding path does not exist: ${relativePath}`);
    }
  }
  assert.equal(ids.size, 8, "unexpected active trigger count");
}

if (process.argv[1] && /trigger-registry-bindings\.(ts|js)$/.test(process.argv[1])) {
  checkTriggerRegistryBindings();
  console.log("DIAG trigger-registry-bindings: PASS");
}
