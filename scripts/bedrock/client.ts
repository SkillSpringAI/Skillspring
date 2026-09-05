import { hashAnswerText, type AnswerProvenance } from "../../runtime/answers/candidate.js";

export const BEDROCK_REGION = "ap-southeast-2";
export const BEDROCK_PROFILE = "au.anthropic.claude-opus-4-6-v1";

export class BedrockHttpError extends Error {
  constructor(code: string, readonly diagnostic?: string) { super(code); }
}

async function readBoundedJson(response: Response): Promise<any> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 65536) { await reader.cancel(); throw new Error(); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function redactDiagnostic(message: string, token: string): string {
  return message.split(token).join("[REDACTED]")
    .replace(/arn:[^\s"',;]+/g, "[RESOURCE]")
    .replace(/\b\d{12}\b/g, "[ACCOUNT]")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[ACCESS_KEY]")
    .replace(/(?:ABSK)[A-Za-z0-9+/=_-]+/g, "[API_KEY]")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, 1200);
}

/** Test-only provider call. Never imported by the governance runtime. */
export async function probeBedrock(token: string, transport: typeof fetch = fetch) {
  return generateBedrock(token, "In one short sentence, define software governance.", transport);
}

export async function generateBedrock(token: string, prompt: string, transport: typeof fetch = fetch) {
  if (!prompt.trim() || prompt.length > 4096) throw new Error("BEDROCK_INVALID_PROMPT");
  if (!token.trim()) throw new Error("BEDROCK_CREDENTIAL_REQUIRED");
  const endpoint = `https://bedrock-runtime.${BEDROCK_REGION}.amazonaws.com/model/${encodeURIComponent(BEDROCK_PROFILE)}/converse`;
  let response: Response;
  try {
    response = await transport(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 64, temperature: 0 }
      })
    });
  } catch { throw new Error("BEDROCK_NETWORK_OR_TIMEOUT"); }
  if (!response.ok) {
    // Report recognized AWS types and only a redacted JSON message field.
    const knownTypes: Record<string, string> = {
      AccessDeniedException: "ACCESS_DENIED",
      ExpiredTokenException: "EXPIRED_TOKEN",
      UnrecognizedClientException: "UNRECOGNIZED_CLIENT",
      InvalidSignatureException: "INVALID_SIGNATURE",
      UnauthorizedException: "UNAUTHORIZED",
      ValidationException: "VALIDATION",
      ThrottlingException: "THROTTLED"
    };
    const awsType = (response.headers.get("x-amzn-errortype") ?? "").split(":")[0];
    const suffix = Object.hasOwn(knownTypes, awsType) ? `_${knownTypes[awsType]}` : "";
    let diagnostic: string | undefined;
    try {
      const data = await readBoundedJson(response);
      const message = data?.message ?? data?.Message;
      if (typeof message === "string") diagnostic = redactDiagnostic(message, token);
    } catch { /* Preserve the HTTP diagnosis if the error body is unusable. */ }
    throw new BedrockHttpError(`BEDROCK_HTTP_${response.status}${suffix}`, diagnostic);
  }
  // Bound provider data independently of the requested output-token limit.
  let data: any;
  try {
    data = await readBoundedJson(response);
  } catch { throw new Error("BEDROCK_INVALID_RESPONSE"); }
  const message = data?.output?.message;
  if (message?.role !== "assistant" || !Array.isArray(message.content) ||
      message.content.length === 0 || message.content.some((block: any) =>
        !block || typeof block.text !== "string" || Object.keys(block).some(key => key !== "text")) ||
      !["end_turn", "max_tokens"].includes(data.stopReason)) {
    throw new Error("BEDROCK_INVALID_RESPONSE");
  }
  const text = message.content.map((block: { text: string }) => block.text).join("\n");
  if (!text.trim()) throw new Error("BEDROCK_INVALID_RESPONSE");
  const requestId = response.headers.get("x-amzn-requestid");
  if (!requestId || !/^[A-Za-z0-9-]{1,256}$/.test(requestId)) throw new Error("BEDROCK_MISSING_REQUEST_ID");
  const invocation: Omit<AnswerProvenance, "stop_reason"> & { stop_reason: string } = {
    provider: "AWS_BEDROCK", source_region: BEDROCK_REGION, inference_profile_id: BEDROCK_PROFILE,
    request_id: requestId, completed_at: new Date().toISOString(), stop_reason: data.stopReason,
    prompt_sha256: hashAnswerText(prompt), answer_sha256: hashAnswerText(text)
  };
  return { text, stopReason: data.stopReason as string, invocation: Object.freeze(invocation) };
}
