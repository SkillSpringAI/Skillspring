import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../schemas/output.schema.json";
import type { PipelineOutput, Mode, ModeReasonCode, PolicyBlock, PolicyEvidenceStatus } from "./types.js";
import { loadRegistries } from "./registries/registryIndex.js";
import { decideFromFailureCode } from "./lg.js";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

const validate = ajv.compile(schema as any);

function safeMode(out: any): Mode {
  const m = out?.mode;
  return m === "DEFAULT" || m === "GOVERNANCE" || m === "ARCHITECT" ? m : "GOVERNANCE";
}

function safeModeReason(out: any): ModeReasonCode {
  const r = out?.mode_reason ?? out?.policy?.mode_reason;
  return r === "ARCHITECT_KEYWORDS" ||
    r === "RECONSTRUCTION_RISK" ||
    r === "DUAL_USE" ||
    r === "RIGHTS_IMPACT" ||
    r === "DEFAULT_SAFE"
    ? r
    : "DEFAULT_SAFE";
}

function safeTraceId(out: any): string {
  const t = out?.trace_id;
  return typeof t === "string" && t.length > 0 ? t : "NO_TRACE_ID";
}

function extractDatasetNote(out: any): string | null {
  const ev = out?.evidence;
  if (Array.isArray(ev)) {
    const hit = ev.find((e: any) => typeof e?.item === "string" && String(e.item).startsWith("Dataset versions ("));
    if (hit?.item) return String(hit.item);
  }
  const msg = out?.refusal?.message;
  if (typeof msg === "string" && msg.includes("datasets: dual-use=") && msg.includes("reconstruction=")) return msg;
  return null;
}

function parseDatasetVersions(note: string | null): { dual_use: string; reconstruction: string } {
  if (!note) return { dual_use: "UNKNOWN", reconstruction: "UNKNOWN" };

  const du = /dual-use=([^\s\)]+)/i.exec(note)?.[1] ?? "UNKNOWN";
  const rc = /reconstruction=([^\s\)]+)/i.exec(note)?.[1] ?? "UNKNOWN";
  return { dual_use: du, reconstruction: rc };
}

function ensureDatasetNote(message: string, out: any): string {
  // Prefer existing dataset note if present
  const note = extractDatasetNote(out);
  if (note) return message.includes("datasets:") ? message : `${message} (${note})`;

  // Fallback: enforce presence of dataset note for diagnostics.
  // Values may be UNKNOWN if the upstream output had no evidence.
  const dv = parseDatasetVersions(null);
  const fallback = `datasets: dual-use=${dv.dual_use} reconstruction=${dv.reconstruction}`;
  return message.includes("datasets:") ? message : `${message} (${fallback})`;
}

function evidenceStatusFrom(out: any): PolicyEvidenceStatus {
  const ev = out?.evidence;
  if (!Array.isArray(ev) || ev.length === 0) return "UNKNOWN";
  const anyUnknown = ev.some((e: any) => e?.status === "UNKNOWN");
  return anyUnknown ? "UNKNOWN" : "KNOWN";
}

function makePolicy(out: any, decision: "ALLOW" | "REFUSE", decision_code: string): PolicyBlock {
  const note = extractDatasetNote(out);
  const dv = parseDatasetVersions(note);
  return {
    decision,
    decision_code,
    mode_reason: safeModeReason(out),
    dataset_versions: { dual_use: dv.dual_use, reconstruction: dv.reconstruction },
    trigger_hits: [],
    evidence_status: evidenceStatusFrom(out)
  };
}

type RefusalBinding = {
  invariant_id: string;
  failure_code: string;
  owner: string;
  retry_scope: "none" | "scoped_retry" | "artifact_rebuild";
};

function bindRefusal(code: string): RefusalBinding {
  // Map internal refusal codes to invariants (must exist in registries)
  const mapping: Record<string, { invariant_id: string }> = {
    "REFUSE-OUTPUT-NOT-ADMISSIBLE": { invariant_id: "INV-030" },
    "REFUSE-CAPABILITY-LEAK": { invariant_id: "INV-031" },
    "REFUSE-INVALID-DLA": { invariant_id: "INV-032" },
    "REFUSE-INVALID-PT": { invariant_id: "INV-032" },
    "REFUSE-MISSING-DLA": { invariant_id: "INV-032" },
    "REFUSE-MISSING-PT": { invariant_id: "INV-032" }
  };

  const invId = mapping[code]?.invariant_id ?? "INV-032";

  const { failure, invariants } = loadRegistries();
  const inv = invariants.invariants.find((x) => x.invariant_id === invId);
  if (!inv) throw new Error(`OutputGate: unknown invariant_id for refusal binding: ${invId}`);

  const fc = failure.codes.find((x) => x.code === inv.failure_code);
  if (!fc) throw new Error(`OutputGate: invariant ${invId} references unknown failure_code: ${inv.failure_code}`);

  return {
    invariant_id: inv.invariant_id,
    failure_code: fc.code,
    owner: inv.owner,
    retry_scope: fc.retry_scope
  };
}

function refusal(out: any, code: string, message: string): PipelineOutput {
  const mode = safeMode(out);
  const mode_reason = safeModeReason(out);
  const trace_id = safeTraceId(out);

  const decision_code =
    code === "REFUSE-CAPABILITY-LEAK"
      ? "REFUSE_CAPABILITY_LEAK"
      : code === "REFUSE-OUTPUT-NOT-ADMISSIBLE"
        ? "REFUSE_SCHEMA_INVALID"
        : code === "REFUSE-LG-FAILURE-CODE-UNREGISTERED"
          ? "REFUSE_LG_FAILURE_CODE_UNREGISTERED"
          : code === "REFUSE-LG-RETRY-SCOPE-MISMATCH"
            ? "REFUSE_LG_RETRY_SCOPE_MISMATCH"
            : "REFUSE_UNSAFE_OR_UNKNOWN";

  const binding = bindRefusal(code);

  return {
    ok: false,
    mode,
    mode_reason,
    trace_id,
    policy: makePolicy(out, "REFUSE", decision_code),
    refusal: { code, message: ensureDatasetNote(message, out), ...binding }
  };
}


function enforceLegitimacyGateRefusal(out: PipelineOutput): PipelineOutput | null {
  if (out.ok !== false) return null;

  const code = out.refusal?.failure_code;
  if (typeof code !== "string" || code.length === 0) {
    return refusal(out, "REFUSE-LG-FAILURE-CODE-UNREGISTERED", "Legitimacy Gate missing refusal.failure_code for classification.");
  }

  try {
    const lg = decideFromFailureCode(code);
    if (out.refusal?.retry_scope !== lg.retry_scope) {
      return refusal(
        out,
        "REFUSE-LG-RETRY-SCOPE-MISMATCH",
        `Legitimacy Gate retry_scope mismatch for failure_code=${code}: expected ${lg.retry_scope}, got ${String(out.refusal?.retry_scope)}.`
      );
    }
  } catch (err: any) {
    return refusal(
      out,
      "REFUSE-LG-FAILURE-CODE-UNREGISTERED",
      `Legitimacy Gate classification failed for failure_code=${String(code)}: ${String(err?.message ?? err)}`
    );
  }

  return null;
}

function normalizeForScan(text: string): { loose: string; tight: string } {
  const loose = text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();

  const tight = loose.replace(/[^a-z0-9]+/g, "");
  return { loose, tight };
}

function detectCapabilityLeak(text: string): string | null {
  const { loose, tight } = normalizeForScan(text);

  const bannedLoose = [
    "rm -rf",
    "sudo",
    "chmod ",
    "chown ",
    "powershell",
    "cmd.exe",
    "bash",
    "curl ",
    "wget ",
    "invoke-webrequest",
    "set-content",
    "remove-item",
    "start-process",
    "http://",
    "https://",
    "upload",
    "exfiltrate",
    "send to",
    "eval(",
    "child_process",
    "exec(",
    "spawn(",
    "process.exit"
  ];

  const bannedTight = [
    "powershell",
    "cmdexe",
    "rmrf",
    "invokewebrequest",
    "removeitem",
    "startprocess",
    "childprocess",
    "processenv",
    "wget",
    "curl"
  ];

  const hitLoose = bannedLoose.find((s) => loose.includes(s));
  if (hitLoose) return hitLoose;

  const hitTight = bannedTight.find((s) => tight.includes(s));
  if (hitTight) return hitTight;

  return null;
}


function normalizeRefusalIfNeeded(out: any): any {
  // If upstream created a refusal, ensure it meets the current refusal schema.
  if (out?.ok === false && out?.refusal?.code && typeof out?.refusal?.message === "string") {
    const r = out.refusal;

    // Add registry binding fields if missing
    const missingBinding =
      !r.invariant_id || !r.failure_code || !r.owner || !r.retry_scope;

    const binding = missingBinding ? bindRefusal(String(r.code)) : null;

    out.refusal = {
      ...r,
      ...(binding ?? {}),
      message: ensureDatasetNote(String(r.message), out)
    };
  }
  return out;
}

export function assertAdmissible(out: PipelineOutput): PipelineOutput {
  const normalized = normalizeRefusalIfNeeded(out);
  const ok = validate(normalized as any);
  if (!ok) {
    const details = JSON.stringify(validate.errors ?? [], null, 2);
    return refusal(normalized, "REFUSE-OUTPUT-NOT-ADMISSIBLE", "Output failed admissibility schema validation. " + details);
  }

  if (normalized.ok === false) {
    const lgRefusal = enforceLegitimacyGateRefusal(normalized);
    if (lgRefusal) return lgRefusal;
  }

  if (normalized.ok === true) {
    const text = normalized.response?.text ?? "";
    if (typeof text === "string" && text.length > 0) {
      const hit = detectCapabilityLeak(text);
      if (hit) {
        const suffixNote = extractDatasetNote(normalized);
        const suffix = suffixNote ? ` (${suffixNote})` : "";
        return refusal(
          normalized,
          "REFUSE-CAPABILITY-LEAK",
          `Output contained capability-like language ("${hit}"). Refusing under output policy.${suffix}`
        );
      }
    }
  }

  return out;
}




