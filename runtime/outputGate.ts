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

export function assertAdmissible(out: PipelineOutput): PipelineOutput {
  const ok = validate(out as any);
  if (!ok) {
    const details = JSON.stringify(validate.errors ?? [], null, 2);
    return {
      ok: false,
      mode: safeMode(out),
      trace_id: safeTraceId(out),
      refusal: {
        code: "REFUSE-OUTPUT-NOT-ADMISSIBLE",
        message: "Output failed admissibility schema validation. " + details
      }
    };
  }
  return out;
}
