import type { InvariantRegistryV1 } from "../invariants";

/**
 * GENERATED (committed). Source of truth remains schemas/registries/invariants.v2.json
 * Runtime must be filesystem-free; validation happens in diagnostics.
 */
export const INVARIANTS_V2: InvariantRegistryV1 = {
  version: "v2",
  invariants: [
    {
        "invariant_id":  "INV-001",
        "owner":  "LG",
        "failure_code":  "LG-H-001",
        "description":  "All emitted failures must bind to a registered invariant_id"
    },
    {
        "invariant_id":  "INV-002",
        "owner":  "LG",
        "failure_code":  "LG-H-002",
        "description":  "All emitted failures must use a registered failure code"
    },
    {
        "invariant_id":  "INV-010",
        "owner":  "LG",
        "failure_code":  "LG-S-001",
        "description":  "Scoped retry cannot change jurisdiction or rights disposition",
        "retry_scope":  "scoped_retry"
    },
    {
        "invariant_id":  "INV-020",
        "owner":  "LG",
        "failure_code":  "LG-A-001",
        "description":  "DLA/PT schema mismatch triggers artifact rebuild only",
        "retry_scope":  "artifact_rebuild"
    },
    {
        "invariant_id":  "INV-030",
        "owner":  "OP",
        "failure_code":  "OP-H-001",
        "description":  "Output admissibility schema validation must be enforced for all outputs"
    },
    {
        "invariant_id":  "INV-031",
        "owner":  "OP",
        "failure_code":  "OP-H-002",
        "description":  "Capability-leak refusals must bind to a registered invariant_id"
    },
    {
        "invariant_id":  "INV-032",
        "owner":  "OP",
        "failure_code":  "OP-H-003",
        "description":  "Output refusal binding must reference a registered invariant_id"
    }
]
};
