import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";

import { FAILURE_CODES_V1 } from "../runtime/registries/generated/failureCodes.v1";
import { INVARIANTS_V1 } from "../runtime/registries/generated/invariants.v1";

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function must(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

type FailureCodesJson = { codes: Array<{ code: string }> };
type InvariantsJson = { invariants: Array<{ invariant_id: string }> };

export async function run() {
  const repoRoot = process.cwd();

  const fcSchema = readJson<object>(path.resolve(repoRoot, "schemas/registries/failure-codes.schema.json"));
  const fcJson = readJson<FailureCodesJson>(path.resolve(repoRoot, "schemas/registries/failure-codes.v1.json"));

  const invSchema = readJson<object>(path.resolve(repoRoot, "schemas/registries/invariants.schema.json"));
  const invJson = readJson<InvariantsJson>(path.resolve(repoRoot, "schemas/registries/invariants.v1.json"));

  const ajv = new Ajv({ allErrors: true, strict: true });

  const v1 = ajv.compile(fcSchema);
  must(v1(fcJson), `failure-codes.v1.json invalid: ${JSON.stringify(v1.errors)}`);

  const v2 = ajv.compile(invSchema);
  must(v2(invJson), `invariants.v1.json invalid: ${JSON.stringify(v2.errors)}`);

  // Compare to generated constants (keys only, deterministic)
  const jsonFcCodes: Set<string> = new Set(fcJson.codes.map((x) => x.code));
  const genFcCodes: Set<string> = new Set(FAILURE_CODES_V1.codes.map((x) => x.code));

  must(jsonFcCodes.size === genFcCodes.size, "Generated failure codes out of sync with JSON");
  for (const c of jsonFcCodes) {
    must(genFcCodes.has(c), `Generated failure codes missing: ${c}`);
  }

  const jsonInvIds: Set<string> = new Set(invJson.invariants.map((x) => x.invariant_id));
  const genInvIds: Set<string> = new Set(INVARIANTS_V1.invariants.map((x) => x.invariant_id));

  must(jsonInvIds.size === genInvIds.size, "Generated invariants out of sync with JSON");
  for (const id of jsonInvIds) {
    must(genInvIds.has(id), `Generated invariants missing: ${id}`);
  }

  return {
    ok: true,
    failure_codes: jsonFcCodes.size,
    invariants: jsonInvIds.size
  };
}
