import { checkEnforcementExpectations } from "./enforcement-tests.js";
import { checkDatasetIntegrity } from "./integrity-tests.js";
import { pipelineFailClosedDiagnostics } from "./pipeline-tests.js";
import { checkOutputInvariants } from "./output-invariants.js";
import { checkCapabilityGuard } from "./capability-guard-tests.js";
import { checkDatasetVersionBinding } from "./dataset-version-binding.js";
import { checkNegativeCapabilities } from "./negative-capability-tests.js";
import { checkDriftSnapshots } from "./drift-snapshot.js";

async function runStep(name: string, fn: () => any | Promise<any>) {
  try {
    await fn();
    console.log(`DIAG ${name}: PASS`);
  } catch (err: any) {
    console.error(`DIAG ${name}: FAIL`);
    throw err;
  }
}

async function main() {
  await runStep("integrity", () => checkDatasetIntegrity());
  await runStep("enforcement", () => checkEnforcementExpectations());
  await runStep("pipeline", () => pipelineFailClosedDiagnostics());
  await runStep("output-invariants", () => checkOutputInvariants());
  await runStep("capability-guard", () => checkCapabilityGuard());
  await runStep("dataset-version-binding", () => checkDatasetVersionBinding());
  await runStep("negative-capabilities", () => checkNegativeCapabilities());
  await runStep("drift-snapshot", () => checkDriftSnapshots());

  console.log("DIAG: PASS");
}

main().catch((err) => {
  console.error("DIAG: FAIL");
  throw err;
});