import Ajv from "ajv";
import addFormats from "ajv-formats";
import requestSchema from "../../schemas/api/evaluate-request.v1.schema.json";
import responseSchema from "../../schemas/api/evaluate-response.v1.schema.json";
import outputSchema from "../../schemas/output.schema.json";
import { runGovernedPipeline } from "../pipeline.js";
import type { PipelineOutput } from "../types.js";

export type EvaluationRequestV1 = {
  schema_version: "skillspring.evaluate.request.v1";
  user_input: string;
};

export type EvaluationResponseV1 = {
  schema_version: "skillspring.evaluate.response.v1";
} & (
  | { result: PipelineOutput; error?: never }
  | { error: { code: "INVALID_REQUEST" | "EVALUATION_FAILED"; message: string }; result?: never }
);

const ajv = new Ajv({ strict: true, ownProperties: true });
addFormats(ajv);
ajv.addSchema(outputSchema, "https://skillspring.dev/schemas/output.schema.json");
const validateRequest = ajv.compile<EvaluationRequestV1>(requestSchema);
const validateResponse = ajv.compile(responseSchema);

function error(code: "INVALID_REQUEST" | "EVALUATION_FAILED", message: string): EvaluationResponseV1 {
  return { schema_version: "skillspring.evaluate.response.v1", error: { code, message } };
}

/** JSON request boundary. Diagnostic controls and caller authority are not accepted. */
export async function evaluateV1(request: unknown): Promise<EvaluationResponseV1> {
  try {
    if (!validateRequest(request)) {
      return error("INVALID_REQUEST", "Request does not match skillspring.evaluate.request.v1.");
    }
    // Construct explicitly: never forward caller metadata or authority artifacts.
    const result = await runGovernedPipeline({ user_input: request.user_input });
    const response: EvaluationResponseV1 = { schema_version: "skillspring.evaluate.response.v1", result };
    if (!validateResponse(response)) {
      return error("EVALUATION_FAILED", "Evaluation could not produce a valid governed result.");
    }
    return response;
  } catch {
    // Internal exception details and request contents do not cross the boundary.
    return error("EVALUATION_FAILED", "Evaluation could not produce a valid governed result.");
  }
}
