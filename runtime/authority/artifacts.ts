import crypto from "node:crypto";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import type { Mode, ModeReasonCode, PolicyDecision } from "../types.js";
import dlaSchema from "../../schemas/authority/decision-legitimacy-artifact.schema.json";
import ptSchema from "../../schemas/authority/permission-token.schema.json";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

const validateDlaSchema = ajv.compile(dlaSchema as any);
const validatePtSchema = ajv.compile(ptSchema as any);

export type DecisionLegitimacyArtifact = {
  id: string;
  trace_id: string;
  parent_dla?: string | null;
  mode: Mode;
  mode_reason: ModeReasonCode;
  policy_snapshot: {
    decision: PolicyDecision;
    decision_code: string;
    mode_reason: ModeReasonCode;
  };
  timestamp: string;
  integrity_hash: string;
};

export type PermissionToken = {
  token_id: string;
  bound_dla_id: string;
  expires_at: string;
  allow_execution: boolean;
  allow_output: boolean;
  jurisdiction_scope: string[];
  retry_scope: "none" | "scoped_retry" | "artifact_rebuild";
};

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function canonicalJson(input: unknown): string {
  if (Array.isArray(input)) return `[${input.map(canonicalJson).join(",")}]`;
  if (input && typeof input === "object") {
    const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(input);
}

function createId(prefix: "dla" | "pt", seed: string): string {
  return `${prefix}_${sha256Hex(seed).slice(0, 16)}`;
}

export function computeDecisionLegitimacyIntegrityHash(input: {
  id: string;
  trace_id: string;
  parent_dla?: string | null;
  mode: Mode;
  mode_reason: ModeReasonCode;
  policy_snapshot: {
    decision: PolicyDecision;
    decision_code: string;
    mode_reason: ModeReasonCode;
  };
  timestamp: string;
}): string {
  return sha256Hex(
    canonicalJson({
      id: input.id,
      trace_id: input.trace_id,
      parent_dla: input.parent_dla ?? null,
      mode: input.mode,
      mode_reason: input.mode_reason,
      policy_snapshot: input.policy_snapshot,
      timestamp: input.timestamp
    })
  );
}

export function buildDecisionLegitimacyArtifact(input: {
  trace_id: string;
  parent_dla?: string | null;
  mode: Mode;
  mode_reason: ModeReasonCode;
  policy_snapshot: {
    decision: PolicyDecision;
    decision_code: string;
    mode_reason: ModeReasonCode;
  };
  timestamp?: string;
}): DecisionLegitimacyArtifact {
  const timestamp = input.timestamp ?? new Date().toISOString();

  const core = {
    trace_id: input.trace_id,
    parent_dla: input.parent_dla ?? null,
    mode: input.mode,
    mode_reason: input.mode_reason,
    policy_snapshot: input.policy_snapshot,
    timestamp
  };

  const id = createId("dla", canonicalJson(core));
  const integrity_hash = sha256Hex(canonicalJson({ ...core, id }));

  const artifact: DecisionLegitimacyArtifact = {
    id,
    trace_id: input.trace_id,
    parent_dla: input.parent_dla ?? null,
    mode: input.mode,
    mode_reason: input.mode_reason,
    policy_snapshot: { ...input.policy_snapshot },
    timestamp,
    integrity_hash
  };

  const result = validateDecisionLegitimacyArtifact(artifact);
  if (!result.ok) {
    throw new Error(`Invalid DecisionLegitimacyArtifact built: ${result.errors}`);
  }

  return Object.freeze(artifact);
}

export function validateDecisionLegitimacyArtifact(input: unknown): { ok: true } | { ok: false; errors: string } {
  const ok = validateDlaSchema(input as any);
  if (!ok) {
    return { ok: false, errors: JSON.stringify(validateDlaSchema.errors ?? [], null, 2) };
  }

  const artifact = input as DecisionLegitimacyArtifact;

  const recalculated = computeDecisionLegitimacyIntegrityHash({
    id: artifact.id,
    trace_id: artifact.trace_id,
    parent_dla: artifact.parent_dla ?? null,
    mode: artifact.mode,
    mode_reason: artifact.mode_reason,
    policy_snapshot: artifact.policy_snapshot,
    timestamp: artifact.timestamp
  });

  if (artifact.integrity_hash !== recalculated) {
    return { ok: false, errors: "integrity_hash mismatch" };
  }

  return { ok: true };
}

export function buildPermissionToken(input: {
  bound_dla_id: string;
  allow_execution: boolean;
  allow_output: boolean;
  jurisdiction_scope?: string[];
  retry_scope: "none" | "scoped_retry" | "artifact_rebuild";
  expires_at?: string;
  ttl_seconds?: number;
}): PermissionToken {
  const ttlMs = Math.max(1, (input.ttl_seconds ?? 300) * 1000);
  const expiresAt = input.expires_at ?? new Date(Date.now() + ttlMs).toISOString();

  const token: PermissionToken = {
    token_id: createId("pt", canonicalJson({ ...input, expires_at: expiresAt })),
    bound_dla_id: input.bound_dla_id,
    expires_at: expiresAt,
    allow_execution: input.allow_execution,
    allow_output: input.allow_output,
    jurisdiction_scope: input.jurisdiction_scope && input.jurisdiction_scope.length > 0 ? [...input.jurisdiction_scope] : ["GLOBAL"],
    retry_scope: input.retry_scope
  };

  const result = validatePermissionToken(token);
  if (!result.ok) {
    throw new Error(`Invalid PermissionToken built: ${result.errors}`);
  }

  return Object.freeze(token);
}

export function validatePermissionToken(input: unknown): { ok: true } | { ok: false; errors: string } {
  const ok = validatePtSchema(input as any);
  if (!ok) {
    return { ok: false, errors: JSON.stringify(validatePtSchema.errors ?? [], null, 2) };
  }

  const token = input as PermissionToken;
  if (Number.isNaN(Date.parse(token.expires_at))) {
    return { ok: false, errors: "expires_at is not a parseable date-time" };
  }

  return { ok: true };
}
