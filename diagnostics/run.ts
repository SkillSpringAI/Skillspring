import { run as checkClaimsEvidenceGate } from "./claims-evidence-gate";
import { run as checkNomosOrder } from "./nomos-order";
import { run as checkMnSplit } from "./mn-split";
import { checkDatasetIntegrity } from "./integrity-tests.js";
import { checkEnforcementExpectations } from "./enforcement-tests.js";
import { pipelineFailClosedDiagnostics } from "./pipeline-tests.js";
import { checkOutputInvariants } from "./output-invariants.js";
import { checkCapabilityGuard } from "./capability-guard-tests.js";
import { checkDatasetVersionBinding } from "./dataset-version-binding.js";
import { checkNegativeCapabilities } from "./negative-capability-tests.js";
import { checkDriftSnapshots } from "./drift-snapshot.js";

import { run as checkRefusalPreservation } from "./refusal-preservation";
import { run as checkRegistryCompleteness } from "./registry-completeness";
import { run as checkRegistryChangeProtocol } from "./registry-change-protocol";
import { run as checkAllowPreservation } from "./allow-preservation";
import { run as checkRegistryGeneratedSync } from "./registry-generated-sync";
import { checkAuthorityArtifacts } from "./authority-artifacts.js";
import { checkRefusalBindingV2 } from "./refusal-binding-v2.js";
import { checkLgMapping } from "./lg-mapping.js";
import { checkLumensVerification } from "./lumens-verification.js";

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

  await runStep("refusal-preservation", () => checkRefusalPreservation());
  await runStep("registry-completeness", () => checkRegistryCompleteness());
  await runStep("registry-change-protocol", () => checkRegistryChangeProtocol());
  await runStep("registry-generated-sync", () => checkRegistryGeneratedSync());
  await runStep("lg-mapping", () => checkLgMapping());
  await runStep("allow-preservation", () => checkAllowPreservation());
  await runStep("authority-artifacts", () => checkAuthorityArtifacts());
  await runStep("lumens-verification", () => checkLumensVerification());
  await runStep("refusal-binding-v2", () => checkRefusalBindingV2());

  await runStep("nomos-order", () => checkNomosOrder());

  await runStep("claims-evidence-gate", () => checkClaimsEvidenceGate());

  console.log("DIAG: PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

