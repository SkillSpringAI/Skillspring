import { BEDROCK_PROFILE, BEDROCK_REGION, BedrockHttpError, probeBedrock } from "./client.js";
import { evaluateV1 } from "../../runtime/api/evaluate.js";

async function main() {
  if (!process.argv.includes("--live")) {
    console.log("No AWS call made. Use npm run bedrock:smoke -- --live for one paid test request.");
    return;
  }
  const result = await probeBedrock(process.env.AWS_BEARER_TOKEN_BEDROCK ?? "");
  // Re-evaluate provider text as untrusted INPUT. Do not emit it as a governed answer.
  const evaluation = await evaluateV1({
    schema_version: "skillspring.evaluate.request.v1", user_input: result.text
  });
  if (!evaluation.result) throw new Error("BEDROCK_EVALUATION_FAILED");
  console.log(JSON.stringify({
    provider: "AWS Bedrock", region: BEDROCK_REGION, profile: BEDROCK_PROFILE,
    connected: true, generated_characters: result.text.length, stop_reason: result.stopReason,
    evaluation: evaluation.result.policy.decision,
    governance_manifest_id: evaluation.result.policy.governance_manifest_id,
    note: "Provider text was evaluated as untrusted input. No generated answer or execution was authorized."
  }, null, 2));
}

main().catch(error => {
  const code = error instanceof Error && /^BEDROCK_[A-Z0-9_]+$/.test(error.message)
    ? error.message : "BEDROCK_TEST_FAILED";
  console.error(code);
  if (error instanceof BedrockHttpError && error.diagnostic) {
    console.error(`AWS diagnostic (redacted): ${JSON.stringify(error.diagnostic)}`);
  }
  process.exitCode = 1;
});
