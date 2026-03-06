import type { InvariantOwner } from "./registries/invariants.js";
import { loadRegistries } from "./registries/registryIndex.js";
import type { RetryScope } from "./registries/failureCodes.js";
import { computeDecisionLegitimacyIntegrityHash } from "./authority/artifacts.js";

type RefusalBinding = {
  invariant_id: string;
  owner: InvariantOwner;
  failure_code: string;
  retry_scope: RetryScope;
};

export type LumensVerificationResult =
  | { ok: true }
  | {
      ok: false;
      code: string;
      message: string;
      invariant_id: string;
      owner: InvariantOwner;
      failure_code: string;
      retry_scope: RetryScope;
    };

function bindInvariant(invariant_id: string): RefusalBinding {
  const { invariants, failure } = loadRegistries();
  const inv = invariants.invariants.find((x) => x.invariant_id === invariant_id);
  if (!inv) {
    return {
      invariant_id: "INV-001",
      owner: "LG",
      failure_code: "LG-H-001",
      retry_scope: "none"
    };
  }

  const fc = failure.codes.find((x) => x.code === inv.failure_code);
  if (!fc) {
    return {
      invariant_id: "INV-002",
      owner: "LG",
      failure_code: "LG-H-002",
      retry_scope: "none"
    };
  }

  return {
    invariant_id: inv.invariant_id,
    owner: inv.owner,
    failure_code: fc.code,
    retry_scope: fc.retry_scope
  };
}

function fail(code: string, message: string, invariant_id: string): LumensVerificationResult {
  const b = bindInvariant(invariant_id);
  return { ok: false, code, message, ...b };
}

export function verifyAuthority(opts: {
  dla: any;
  pt?: any;
  policy?: any;
  now?: Date;
}): LumensVerificationResult {
  const dla = opts?.dla;
  if (!dla || typeof dla !== "object") {
    return fail("REFUSE-LUMENS-DLA-INTEGRITY", "Lumens: missing DLA artifact.", "INV-001");
  }

  const required = ["id", "trace_id", "mode", "mode_reason", "policy_snapshot", "timestamp", "integrity_hash"];
  const missing = required.filter((k) => !(k in dla));
  if (missing.length > 0) {
    return fail("REFUSE-LUMENS-DLA-INTEGRITY", `Lumens: DLA missing required fields: ${missing.join(", ")}.`, "INV-001");
  }

  const recomputed = computeDecisionLegitimacyIntegrityHash({
    id: String(dla.id),
    trace_id: String(dla.trace_id),
    parent_dla: (dla.parent_dla ?? null) as string | null,
    mode: dla.mode,
    mode_reason: dla.mode_reason,
    policy_snapshot: dla.policy_snapshot,
    timestamp: String(dla.timestamp)
  });

  if (String(dla.integrity_hash) !== recomputed) {
    return fail("REFUSE-LUMENS-DLA-INTEGRITY", "Lumens: DLA integrity hash mismatch.", "INV-001");
  }

  const pt = opts?.pt;
  if (pt) {
    if (String(pt.bound_dla_id ?? "") !== String(dla.id)) {
      return fail("REFUSE-LUMENS-PT-BINDING", "Lumens: PT bound_dla_id does not match DLA id.", "INV-001");
    }

    if (pt.expires_at) {
      // Deterministic default for verification callers that do not inject time.
      const now = opts.now ?? new Date(0);
      const expMs = Date.parse(String(pt.expires_at));
      if (Number.isFinite(expMs) && expMs <= now.getTime()) {
        return fail("REFUSE-LUMENS-PT-EXPIRED", "Lumens: PT has expired.", "INV-001");
      }
    }
  }

  return { ok: true };
}
