import { checkEnforcementExpectations } from "./enforcement-tests";
import { checkDatasetIntegrity } from "./integrity-tests";
import { pipelineFailClosedDiagnostics } from "./pipeline-tests";
import { checkOutputInvariants } from "./output-invariants";

async function main() {
  checkDatasetIntegrity();
  await checkEnforcementExpectations();
  await pipelineFailClosedDiagnostics();
  await checkOutputInvariants();
  console.log("DIAG: PASS");
}

main().catch((e) => {
  console.error("DIAG: FAIL");
  console.error(e);
  process.exit(1);
});
