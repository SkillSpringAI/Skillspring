import { BEDROCK_PROFILE, BEDROCK_REGION, generateBedrock } from "./client.js";
import { integrationCases } from "./integration.js";
import { runCandidateCase } from "./candidate-integration.js";

async function main() {
  if (!process.argv.includes("--live")) {
    console.log("No AWS calls made. Use npm run bedrock:candidates -- --live for up to two paid candidate tests.");
    return;
  }
  const token = process.env.AWS_BEARER_TOKEN_BEDROCK ?? "";
  if (!token.trim()) throw new Error("BEDROCK_CREDENTIAL_REQUIRED");
  const reports = [];
  for (const test of integrationCases) {
    const report = await runCandidateCase(test, prompt => generateBedrock(token, prompt));
    reports.push(report);
    if (report.outcome === "PROVIDER_FAILED") break;
  }
  const passed = reports.length === integrationCases.length && reports.every(report =>
    ["INPUT_REFUSED", "CANDIDATE_REVIEW_REQUIRED"].includes(report.outcome));
  console.log(JSON.stringify({
    schema_version: "skillspring.candidate-test-report.v1",
    region: BEDROCK_REGION, profile: BEDROCK_PROFILE, passed, reports,
    note: "Candidate validation only. Evidence is unverified and both reviews remain pending; no answer release."
  }, null, 2));
  if (!passed) process.exitCode = 1;
}
main().catch(() => {
  console.error("CANDIDATE_TEST_FAILED: verify credentials; bedrock:smoke provides provider diagnostics.");
  process.exitCode = 1;
});
