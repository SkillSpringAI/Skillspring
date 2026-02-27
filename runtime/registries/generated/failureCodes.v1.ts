import type { FailureCodeRegistryV1 } from "../failureCodes";

/**
 * GENERATED (committed). Source of truth remains schemas/registries/failure-codes.v1.json
 * Runtime must be filesystem-free; validation happens in diagnostics.
 */
export const FAILURE_CODES_V1: FailureCodeRegistryV1 = {
  version: "v1",
  codes: [
    {
      code: "LG-H-001",
      layer: "LG",
      class: "H",
      summary: "Unbound failure emission (invariant_id missing or not registered)",
      retry_scope: "none",
      notes: "LG must reject any failure lacking invariant binding."
    },
    {
      code: "LG-H-002",
      layer: "LG",
      class: "H",
      summary: "Failure code is not registered in failure registry",
      retry_scope: "none"
    },
    {
      code: "LG-S-001",
      layer: "LG",
      class: "S",
      summary: "Scoped retry permitted for invariant-targeted repair",
      retry_scope: "scoped_retry",
      notes: "Retry cannot change jurisdiction or rights disposition."
    },
    {
      code: "LG-A-001",
      layer: "LG",
      class: "A",
      summary: "Artifact rebuild required (DLA/PT mismatch or invalid schema)",
      retry_scope: "artifact_rebuild"
    },
    {
      code: "DIAG-H-001",
      layer: "DIAG",
      class: "H",
      summary: "Registry schema validation failed",
      retry_scope: "none"
    }
  ]
};
