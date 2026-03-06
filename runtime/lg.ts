import { loadFailureCodeRegistry, type FailureCodeEntry, type FailureCodeRegistryV1, type RetryScope } from "./registries/failureCodes.js";
import { loadInvariantRegistry, type InvariantRegistryV1 } from "./registries/invariants.js";

export type LGOutcome = {
  disposition: "HALT" | "SCOPED_RETRY" | "ARTIFACT_REBUILD";
  retry_scope: RetryScope;
  failure: FailureCodeEntry;
};

function outcomeFromFailure(failure: FailureCodeEntry): LGOutcome {
  const disposition =
    failure.class === "H"
      ? "HALT"
      : failure.class === "S"
        ? "SCOPED_RETRY"
        : "ARTIFACT_REBUILD";

  return {
    disposition,
    retry_scope: failure.retry_scope,
    failure
  };
}

export function decideFromFailureCode(
  code: string,
  registries?: { failure?: FailureCodeRegistryV1 }
): LGOutcome {
  const failureReg = registries?.failure ?? loadFailureCodeRegistry();
  const failure = failureReg.codes.find((x) => x.code === code);
  if (!failure) {
    throw new Error(`LG: unknown failure_code: ${code}`);
  }

  return outcomeFromFailure(failure);
}

export function decideFromInvariant(
  invariant_id: string,
  registries?: { failure?: FailureCodeRegistryV1; invariants?: InvariantRegistryV1 }
): LGOutcome {
  const failureReg = registries?.failure ?? loadFailureCodeRegistry();
  const invariantReg = registries?.invariants ?? loadInvariantRegistry({ failureRegistry: failureReg });

  const inv = invariantReg.invariants.find((x) => x.invariant_id === invariant_id);
  if (!inv) {
    throw new Error(`LG: unknown invariant_id: ${invariant_id}`);
  }

  return decideFromFailureCode(inv.failure_code, { failure: failureReg });
}
