import { FAILURE_CODES_V2 } from "./generated/failureCodes.v2";
export type FailureClass = "H" | "S" | "A";
export type FailureLayer = "CP" | "MN" | "NM" | "LK" | "LG" | "OP" | "DIAG";
export type RetryScope = "none" | "scoped_retry" | "artifact_rebuild";

export interface FailureCodeEntry {
  code: string;          // LAYER-CLASS-ID
  layer: FailureLayer;
  class: FailureClass;
  summary: string;
  retry_scope: RetryScope;
  notes?: string;
}

export interface FailureCodeRegistryV1 {
  version: "v1" | "v2";
  codes: FailureCodeEntry[];
}

import { FAILURE_CODES_V1 } from "./generated/failureCodes.v1";

export function loadFailureCodeRegistry(): FailureCodeRegistryV1 {
  // Runtime is filesystem-free. Schema validation happens in diagnostics.
  return FAILURE_CODES_V2 as any;
}

export function getFailureCodeIndex(reg: FailureCodeRegistryV1): Map<string, FailureCodeEntry> {
  const m = new Map<string, FailureCodeEntry>();
  for (const c of reg.codes) m.set(c.code, c);
  return m;
}



