import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../schemas/output.schema.json";
import type { PipelineOutput, Mode } from "./types";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

const validate = ajv.compile(schema as any);

function safeMode(out: any): Mode {
  const m = out?.mode;
  return m === "DEFAULT" || m === "GOVERNANCE" || m === "ARCHITECT" ? m : "GOVERNANCE";
}

function safeTraceId(out: any): string {
  const t = out?.trace_id;
  return typeof t === "string" && t.length > 0 ? t : "NO_TRACE_ID";
}

function extractDatasetNote(out: any): string | null {
  // Prefer the "Dataset versions" evidence item if present
  const ev = out?.evidence;
  if (Array.isArray(ev)) {
    const hit = ev.find((e: any) => typeof e?.item === "string" && String(e.item).startsWith("Dataset versions ("));
    if (hit?.item) return String(hit.item);
  }
  // Otherwise try to preserve an existing refusal message note
  const msg = out?.refusal?.message;
  if (typeof msg === "string" && msg.includes("datasets: dual-use=") && msg.includes("reconstruction=")) return msg;
  return null;
}

// Simple capability-leak guard for ok:true outputs.
// Intentionally conservative and auditor-friendly.
function detectCapabilityLeak(text: string): string | null {
  const t = text.toLowerCase();

  const banned = [
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

  const hit = banned.find((s) => t.includes(s));
  return hit ?? null;
}

function refusal(out: any, code: string, message: string): PipelineOutput {
  return {
    ok: false,
    mode: safeMode(out),
    trace_id: safeTraceId(out),
    refusal: { code, message }
  };
}

export function assertAdmissible(out: PipelineOutput): PipelineOutput {
  // 1) Schema validation
  const ok = validate(out as any);
  if (!ok) {
    const details = JSON.stringify(validate.errors ?? [], null, 2);
    return refusal(out, "REFUSE-OUTPUT-NOT-ADMISSIBLE", "Output failed admissibility schema validation. " + details);
  }

  // 2) Capability leak guard (only for ok:true textual responses)
  if (out.ok === true) {
    const text = out.response?.text ?? "";
    if (typeof text === "string" && text.length > 0) {
      const hit = detectCapabilityLeak(text);
      if (hit) {
        const ds = extractDatasetNote(out);
        const suffix = ds ? ` (${ds})` : "";
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

