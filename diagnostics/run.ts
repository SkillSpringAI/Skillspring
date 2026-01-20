import { checkEnforcementExpectations } from "./enforcement-tests";
import { checkDatasetIntegrity } from "./integrity-tests";
import { pipelineFailClosedDiagnostics } from "./pipeline-tests";
import { checkOutputInvariants } from "./output-invariants";
import { checkCapabilityGuard } from "./capability-guard-tests";
import { checkDatasetVersionBinding } from "./dataset-version-binding";
import { checkModeReasonTransparency } from "./mode-reason-tests";

async function main() {
  checkDatasetIntegrity();
  await checkEnforcementExpectations();
  await pipelineFailClosedDiagnostics();
  await checkOutputInvariants();
  checkCapabilityGuard();
  await checkDatasetVersionBinding();
  await checkModeReasonTransparency();
console.log("DIAG: PASS");
}

main().catch((e) => {
  console.error("DIAG: FAIL");
  console.error(e);
  process.exit(1);
});
