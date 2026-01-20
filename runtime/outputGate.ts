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

// Simple capability-leak guard for ok:true outputs.
// This is intentionally conservative and buyer/auditor-friendly.
function detectCapabilityLeak(text: string): string | null {
  const t = text.toLowerCase();

  const banned = [
    // filesystem / commands
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
    // network / exfil indicators
    "http://",
    "https://",
    "upload",
    "exfiltrate",
    "send to",
    // code execution hints
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
        return refusal(
          out,
          "REFUSE-CAPABILITY-LEAK",
          `Output contained capability-like language ("${hit}"). Refusing under output policy.`
        );
      }
    }
  }

  return out;
}
