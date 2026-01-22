import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../schemas/output.schema.json";
import type { PipelineOutput, Mode, ModeReasonCode, PolicyBlock, PolicyEvidenceStatus } from "./types.js";

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

  // Accept either: "datasets: dual-use=X reconstruction=Y" (common in messages)
  // or any string containing "dual-use=" and "reconstruction="
  const du = /dual-use=([^\s\)]+)/i.exec(note)?.[1] ?? "UNKNOWN";
  const rc = /reconstruction=([^\s\)]+)/i.exec(note)?.[1] ?? "UNKNOWN";
  return { dual_use: du, reconstruction: rc };
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

function refusal(out: any, code: string, message: string): PipelineOutput {
  const mode = safeMode(out);
  const mode_reason = safeModeReason(out);
  const trace_id = safeTraceId(out);

  // Map internal refusal codes to stable decision codes
  const decision_code =
    code === "REFUSE-CAPABILITY-LEAK"
      ? "REFUSE_CAPABILITY_LEAK"
      : code === "REFUSE-OUTPUT-NOT-ADMISSIBLE"
        ? "REFUSE_SCHEMA_INVALID"
        : "REFUSE_UNSAFE_OR_UNKNOWN";

  return {
    ok: false,
    mode,
    mode_reason,
    trace_id,
    policy: makePolicy(out, "REFUSE", decision_code),
    refusal: { code, message }
  };
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

export function assertAdmissible(out: PipelineOutput): PipelineOutput {
  // Schema validate first
  const ok = validate(out as any);
  if (!ok) {
    const details = JSON.stringify(validate.errors ?? [], null, 2);
    return refusal(out, "REFUSE-OUTPUT-NOT-ADMISSIBLE", "Output failed admissibility schema validation. " + details);
  }

  // Capability leak scan only for ok outputs
  if (out.ok === true) {
    const text = out.response?.text ?? "";
    if (typeof text === "string" && text.length > 0) {
      const hit = detectCapabilityLeak(text);
      if (hit) {
        const suffixNote = extractDatasetNote(out);
        const suffix = suffixNote ? ` (${suffixNote})` : "";
        return refusal(
          out,
          "REFUSE-CAPABILITY-LEAK",
          `Output contained capability-like language ("${hit}"). Refusing under output policy.${suffix}`
        );
      }
    }
  }

  return out;
}
