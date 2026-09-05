import { BEDROCK_PROFILE, BEDROCK_REGION, generateBedrock } from "./client.js";
import { integrationCases, runIntegrationCase } from "./integration.js";

async function main() {
  if (!process.argv.includes("--live")) {
    console.log("No AWS calls made. Use npm run bedrock:evaluate -- --live for up to two paid synthetic test requests.");
    return;
  }
  const token = process.env.AWS_BEARER_TOKEN_BEDROCK ?? "";
  if (!token.trim()) throw new Error("BEDROCK_CREDENTIAL_REQUIRED");
  const reports = [];
  for (const test of integrationCases) {
    const report = await runIntegrationCase(test, prompt => generateBedrock(token, prompt));
    reports.push(report);
    if (report.outcome === "PROVIDER_FAILED") break;
  }
  const passed = reports.length === integrationCases.length && reports.every(report =>
    ["INPUT_REFUSED", "OUTPUT_PROBE_PASSED"].includes(report.outcome));
  console.log(JSON.stringify({
    region: BEDROCK_REGION, profile: BEDROCK_PROFILE, passed, reports,
    note: "Diagnostic output probes only; generated answers are not authorized for release."
  }, null, 2));
  if (!passed) process.exitCode = 1;
}

main().catch(() => {
  console.error("INTEGRATION_FAILED: check credentials and run bedrock:smoke for provider diagnostics.");
  process.exitCode = 1;
});
