import type { RetryScope, FailureCodeRegistryV1 } from "./failureCodes";
import { getFailureCodeIndex, loadFailureCodeRegistry } from "./failureCodes";
import { INVARIANTS_V1 } from "./generated/invariants.v1";

export type InvariantOwner = "CP" | "MN" | "NM" | "LK" | "LG" | "OP" | "DIAG";

export interface InvariantEntry {
  invariant_id: string; // INV-###
  owner: InvariantOwner;
  failure_code: string; // must exist in failure registry
  description: string;
  retry_scope?: RetryScope; // optional override; otherwise derived from failure registry
}

export interface InvariantRegistryV1 {
  version: "v1";
  invariants: InvariantEntry[];
}

export function loadInvariantRegistry(opts?: {
  failureRegistry?: FailureCodeRegistryV1;
}): InvariantRegistryV1 {
  // Runtime is filesystem-free. Schema validation happens in diagnostics.
  const data = INVARIANTS_V1;

  // Still enforce binding law at runtime (pure, in-memory check).
  const failureReg = opts?.failureRegistry ?? loadFailureCodeRegistry();
  const idx = getFailureCodeIndex(failureReg);

  // Uniqueness
  const seen = new Set<string>();
  for (const inv of data.invariants) {
    if (seen.has(inv.invariant_id)) throw new Error(`Duplicate invariant_id: ${inv.invariant_id}`);
    seen.add(inv.invariant_id);

    const fc = idx.get(inv.failure_code);
    if (!fc) {
      throw new Error(`Invariant ${inv.invariant_id} references unknown failure_code: ${inv.failure_code}`);
    }
    if (inv.retry_scope && inv.retry_scope !== fc.retry_scope) {
      throw new Error(
        `Invariant ${inv.invariant_id} retry_scope=${inv.retry_scope} != failure retry_scope=${fc.retry_scope} (${inv.failure_code})`
      );
    }
  }

  return data;
}

export function getInvariantIndex(reg: InvariantRegistryV1): Map<string, InvariantEntry> {
  const m = new Map<string, InvariantEntry>();
  for (const inv of reg.invariants) m.set(inv.invariant_id, inv);
  return m;
}
