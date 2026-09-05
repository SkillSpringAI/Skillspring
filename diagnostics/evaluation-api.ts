import assert from "node:assert/strict";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { evaluateV1 } from "../runtime/api/evaluate.js";
import { runGovernedPipeline } from "../runtime/pipeline.js";
import responseSchema from "../schemas/api/evaluate-response.v1.schema.json";
import outputSchema from "../schemas/output.schema.json";
import dualUse from "../datasets/risk-patterns/dual-use-patterns.json";
import reconstruction from "../datasets/risk-patterns/reconstruction-vectors.json";

export async function checkEvaluationApi(): Promise<void> {
  const ajv = new Ajv({ strict: true });
  addFormats(ajv);
  ajv.addSchema(outputSchema, "https://skillspring.dev/schemas/output.schema.json");
  const validate = ajv.compile(responseSchema);
  const valid = { schema_version: "skillspring.evaluate.request.v1", user_input: "hello" };
  for (const request of [
    null, [], "hello", {}, { user_input: "hello" },
    { ...valid, schema_version: "skillspring.evaluate.request.v2" },
    ...[null, 12, "", " \n\t", "x".repeat(16385)].map(user_input => ({ ...valid, user_input })),
    { ...valid, meta: { authority_test_overrides: { omit_dla: true } } },
    { ...valid, authority_test_overrides: { omit_pt: true } },
    { ...valid, permission_token: {} }, { ...valid, mode: "ARCHITECT" },
    JSON.parse('{"schema_version":"skillspring.evaluate.request.v1","user_input":"hello","__proto__":{}}')
  ]) {
    const response = await evaluateV1(request);
    assert.equal(response.error?.code, "INVALID_REQUEST");
    assert.equal(validate(response), true, JSON.stringify(validate.errors));
    assert.equal("result" in response, false);
  }
  // Dataset prompts must retain precisely the core pipeline's decisions.
  for (const user_input of ["hello", "x".repeat(16384), ...dualUse.patterns, ...reconstruction.patterns]) {
    const response = await evaluateV1({ ...valid, user_input });
    assert.equal(validate(response), true, JSON.stringify(validate.errors));
    assert.ok(response.result);
    assert.deepEqual(response.result, await runGovernedPipeline({ user_input }));
  }
  const brokenRequest = new Proxy({}, { get() { throw new Error("private internal detail"); } });
  const failed = await evaluateV1(brokenRequest);
  assert.equal(failed.error?.code, "EVALUATION_FAILED");
  assert.equal(JSON.stringify(failed).includes("private internal detail"), false);
  assert.equal(validate(failed), true);
  const allowed = await evaluateV1(valid);
  assert.equal(validate({ ...allowed, error: { code: "INVALID_REQUEST", message: "invalid" } }), false);
  assert.equal(validate({ schema_version: "skillspring.evaluate.response.v1" }), false);
}
