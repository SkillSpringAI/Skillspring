import { loadFailureCodeRegistry } from "./failureCodes";
import { loadInvariantRegistry } from "./invariants";

export function loadRegistries() {
  const failure = loadFailureCodeRegistry();
  const invariants = loadInvariantRegistry({ failureRegistry: failure });
  return { failure, invariants };
}
