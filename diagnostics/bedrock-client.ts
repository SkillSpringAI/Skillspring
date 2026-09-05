import assert from "node:assert/strict";
import { probeBedrock, BEDROCK_PROFILE, BedrockHttpError } from "../scripts/bedrock/client.js";

export async function checkBedrockClient() {
  let calls = 0;
  const transport: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, `https://bedrock-runtime.ap-southeast-2.amazonaws.com/model/${encodeURIComponent(BEDROCK_PROFILE)}/converse`);
    assert.equal(options?.redirect, "error");
    assert.ok(options?.signal);
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-only");
    const body = JSON.parse(options?.body as string);
    assert.equal(body.inferenceConfig.maxTokens, 64);
    assert.equal(body.toolConfig, undefined);
    return Response.json({ output: { message: { role: "assistant", content: [{ text: "Test definition." }] } }, stopReason: "end_turn" }, { headers: { "x-amzn-requestid": "offline-request-1" } });
  };
  await assert.rejects(probeBedrock("", transport), /BEDROCK_CREDENTIAL_REQUIRED/);
  assert.equal(calls, 0);
  assert.equal((await probeBedrock("test-only", transport)).text, "Test definition.");
  assert.equal(calls, 1);
  for (const status of [400, 403, 429, 500]) {
    let attempts = 0;
    await assert.rejects(probeBedrock("test-only", async () => {
      attempts++;
      return new Response("private error details", { status });
    }), new RegExp(`^Error: BEDROCK_HTTP_${status}$`));
    assert.equal(attempts, 1);
  }
  await assert.rejects(probeBedrock("test-only", async () => { throw new Error("private token"); }), /^Error: BEDROCK_NETWORK_OR_TIMEOUT$/);
  for (const [header, suffix] of [
    ["AccessDeniedException", "_ACCESS_DENIED"],
    ["ExpiredTokenException:internal", "_EXPIRED_TOKEN"],
    ["private credential details", ""], ["toString", ""]
  ]) {
    await assert.rejects(probeBedrock("test-only", async () => new Response("private body", {
      status: 403, headers: { "x-amzn-errortype": header }
    })), new RegExp(`^Error: BEDROCK_HTTP_403${suffix}$`));
  }
  for (const body of ["invalid", "x".repeat(65537), JSON.stringify({}), JSON.stringify({
    output: { message: { role: "assistant", content: [{ toolUse: {} }] } }, stopReason: "tool_use"
  })]) {
    await assert.rejects(probeBedrock("test-only", async () => new Response(body)), /^Error: BEDROCK_INVALID_RESPONSE$/);
  }
  await assert.rejects(probeBedrock("test-only", async () => Response.json({
    message: "User arn:aws:iam::123456789012:user/test cannot invoke bedrock:InvokeModel. token=test-only account 123456789012\n"
  }, { status: 403 })), error => {
    assert.ok(error instanceof BedrockHttpError);
    assert.ok(error.diagnostic?.includes("bedrock:InvokeModel"));
    for (const secret of ["test-only", "123456789012", "arn:aws", "\n"]) {
      assert.equal(error.diagnostic?.includes(secret), false);
    }
    return true;
  });
}
