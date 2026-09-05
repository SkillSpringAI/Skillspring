import { INVARIANTS_V2 } from "./generated/invariants.v2";
import { loadFailureCodeRegistry } from "./failureCodes";
export { DECISION_CODES_V1 } from "./generated/decisionCodes.v1";
import { loadInvariantRegistry } from "./invariants";

export function loadRegistries() {
  const failure = loadFailureCodeRegistry();
  const invariants = loadInvariantRegistry({ failureRegistry: failure });
  return { failure, invariants };
}


