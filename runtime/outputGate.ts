import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../schemas/output.schema.json" assert { type: "json" };
import type { PipelineOutput } from "./types.ts";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

const validate = ajv.compile(schema);

export function assertAdmissible(output: PipelineOutput): PipelineOutput {
  if (!validate(output)) {
    return {
      ok: false,
      mode: "GOVERNANCE",
      trace_id: "INVALID-OUTPUT",
      refusal: {
        code: "OP-ADM-01-FAIL",
        message: "Output failed admissibility validation"
      }
    };
  }
  return output;
}
