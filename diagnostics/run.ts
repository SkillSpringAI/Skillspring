import { run as checkClaimsEvidenceGate } from "./claims-evidence-gate";
import { run as checkNomosOrder } from "./nomos-order";
import { checkEvaluationApi } from "./evaluation-api.js";
import { checkHttpEvaluation } from "./http-evaluation.js";
import { checkBedrockClient } from "./bedrock-client.js";
import { checkModelIntegration } from "./model-integration.js";
import { checkAnswerCandidate } from "./answer-candidate.js";
import { checkLiveCandidateAdapter } from "./live-candidate.js";
import { checkModeReviewPolicy } from "./mode-review-policy.js";
import { checkScopedPolicyBoundary } from "./scoped-policy-boundary.js";
import { checkSignedPolicyVerifier } from "./signed-policy-verifier.js";
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
import { checkGovernanceManifest, checkGovernedResultManifestBinding } from "./governance-manifest.js";
import { checkPolicyCodeRegistry } from "./policy-code-registry.js";
import { checkConstitutionMap } from "./constitution-map.js";
import { checkTriggerRegistryBindings } from "./trigger-registry-bindings.js";
import { checkAuthorityLifecycle, checkReplaySemantics } from "./authority-lifecycle.js";

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
  await runStep("governance-manifest", () => checkGovernanceManifest());
  await runStep("governance-manifest-binding", () => checkGovernedResultManifestBinding());
  await runStep("policy-code-registry", () => checkPolicyCodeRegistry());
  await runStep("constitution-map", () => checkConstitutionMap());
  await runStep("trigger-registry-bindings", () => checkTriggerRegistryBindings());
  await runStep("authority-lifecycle", () => checkAuthorityLifecycle());
  await runStep("replay-semantics", () => checkReplaySemantics());

  await runStep("nomos-order", () => checkNomosOrder());

  await runStep("claims-evidence-gate", () => checkClaimsEvidenceGate());
  await runStep("evaluation-api", () => checkEvaluationApi());
  await runStep("http-evaluation", () => checkHttpEvaluation());
  await runStep("bedrock-client-offline", () => checkBedrockClient());
  await runStep("model-integration-offline", () => checkModelIntegration());
  await runStep("answer-candidate-contract", () => checkAnswerCandidate());
  await runStep("live-candidate-adapter-offline", () => checkLiveCandidateAdapter());
  await runStep("mode-review-policy-simulation", () => checkModeReviewPolicy());
  await runStep("scoped-policy-boundary", () => checkScopedPolicyBoundary());
  await runStep("signed-policy-verifier", () => checkSignedPolicyVerifier());

  console.log("DIAG: PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

