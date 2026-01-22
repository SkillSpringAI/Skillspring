import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../schemas/output.schema.json";
import type { PipelineOutput, Mode } from "./types.js";

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
  const ev = out?.evidence;
  if (Array.isArray(ev)) {
    const hit = ev.find((e: any) => typeof e?.item === "string" && String(e.item).startsWith("Dataset versions ("));
    if (hit?.item) return String(hit.item);
  }
  const msg = out?.refusal?.message;
  if (typeof msg === "string" && msg.includes("datasets: dual-use=") && msg.includes("reconstruction=")) return msg;
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

function refusal(out: any, code: string, message: string): PipelineOutput {
  return {
    ok: false,
    mode: safeMode(out),
    trace_id: safeTraceId(out),
    refusal: { code, message }
  };
}

export function assertAdmissible(out: PipelineOutput): PipelineOutput {
  const ok = validate(out as any);
  if (!ok) {
    const details = JSON.stringify(validate.errors ?? [], null, 2);
    return refusal(out, "REFUSE-OUTPUT-NOT-ADMISSIBLE", "Output failed admissibility schema validation. " + details);
  }

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
