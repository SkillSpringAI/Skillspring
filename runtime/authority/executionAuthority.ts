import crypto from "node:crypto";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../../schemas/authority/execution-authority.schema.json";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema as any);

export type ExecutionAuthority = {
  authority_id: string;
  trace_id: string;
  bound_dla_id: string;
  capability: string;
  scope: { resource: string; operation: string; constraints?: Record<string, unknown> };
  purpose: string;
  issued_at: string;
  expires_at: string;
  one_use: boolean;
  policy_snapshot_id: string;
};

export type AuthorityRevalidationContext = {
  trace_id: string;
  policy_snapshot_id: string;
  resource: string;
  operation: string;
  risk_ceiling: number;
  current_risk: number;
  revoked_authority_ids?: ReadonlySet<string>;
  consumed_authority_ids?: ReadonlySet<string>;
  now?: Date;
};

export type AuthorityRevalidationResult =
  | { ok: true }
  | { ok: false; code: "INVALID_AUTHORITY" | "INVALID_CONTEXT" | "NOT_YET_VALID_AUTHORITY" | "EXPIRED_AUTHORITY" | "REVOKED_AUTHORITY" | "REPLAYED_AUTHORITY" | "SCOPE_MISMATCH" | "POLICY_SNAPSHOT_MISMATCH" | "RISK_CEILING_EXCEEDED"; reason: string };

function authorityId(input: Omit<ExecutionAuthority, "authority_id">): string {
  return `ea_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16)}`;
}

export function buildExecutionAuthority(input: Omit<ExecutionAuthority, "authority_id">): ExecutionAuthority {
  const authority = Object.freeze({ ...input, authority_id: authorityId(input) });
  const validation = validateExecutionAuthority(authority);
  if (!validation.ok) throw new Error(`Invalid ExecutionAuthority: ${validation.errors}`);
  return authority;
}

export function validateExecutionAuthority(input: unknown): { ok: true } | { ok: false; errors: string } {
  if (!validateSchema(input)) return { ok: false, errors: JSON.stringify(validateSchema.errors ?? []) };
  const authority = input as ExecutionAuthority;
  const issued = Date.parse(authority.issued_at), expires = Date.parse(authority.expires_at);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued >= expires) {
    return { ok: false, errors: "authority validity window must have issued_at < expires_at" };
  }
  return { ok: true };
}

export function revalidateExecutionAuthority(authority: unknown, context: AuthorityRevalidationContext): AuthorityRevalidationResult {
  const valid = validateExecutionAuthority(authority);
  if (!valid.ok) return { ok: false, code: "INVALID_AUTHORITY", reason: valid.errors };
  const a = authority as ExecutionAuthority;
  const clock = context?.now === undefined ? new Date() : context.now;
  const now = clock instanceof Date ? clock.getTime() : NaN;
  if (!context || !Number.isFinite(now) ||
      !Number.isFinite(context.current_risk) || !Number.isFinite(context.risk_ceiling) ||
      context.current_risk < 0 || context.risk_ceiling < 0) {
    return { ok: false, code: "INVALID_CONTEXT", reason: "clock and non-negative finite risk values are required" };
  }
  if (context.revoked_authority_ids?.has(a.authority_id)) return { ok: false, code: "REVOKED_AUTHORITY", reason: "authority is revoked" };
  if (a.one_use && context.consumed_authority_ids?.has(a.authority_id)) return { ok: false, code: "REPLAYED_AUTHORITY", reason: "one-use authority was already consumed" };
  if (Date.parse(a.expires_at) <= now) return { ok: false, code: "EXPIRED_AUTHORITY", reason: "authority has expired" };
  if (Date.parse(a.issued_at) > now) return { ok: false, code: "NOT_YET_VALID_AUTHORITY", reason: "authority has not been issued yet" };
  if (a.trace_id !== context.trace_id) return { ok: false, code: "SCOPE_MISMATCH", reason: "trace binding mismatch" };
  if (a.policy_snapshot_id !== context.policy_snapshot_id) return { ok: false, code: "POLICY_SNAPSHOT_MISMATCH", reason: "policy snapshot mismatch" };
  if (a.scope.resource !== context.resource || a.scope.operation !== context.operation) return { ok: false, code: "SCOPE_MISMATCH", reason: "resource or operation scope mismatch" };
  if (context.current_risk > context.risk_ceiling) return { ok: false, code: "RISK_CEILING_EXCEEDED", reason: "current risk exceeds authority ceiling" };
  return { ok: true };
}
