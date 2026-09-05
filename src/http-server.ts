import { createServer } from "node:http";
import { evaluateV1 } from "../runtime/api/evaluate.js";

export const HTTP_BODY_LIMIT = 131072;
export const HTTP_REQUEST_TIMEOUT_MS = 2000;

/** Local evaluation only. Host is deliberately not caller-configurable. */
export async function startEvaluationServer(port = 8787) {
  const server = createServer({ maxHeaderSize: 8192, connectionsCheckingInterval: 250 }, (req, res) => {
    const timer = setTimeout(() => fail(408, "REQUEST_TIMEOUT"), HTTP_REQUEST_TIMEOUT_MS);
    const finish = (status: number, body: unknown) => {
      if (res.destroyed || res.writableEnded) return;
      clearTimeout(timer);
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Connection": "close"
      });
      res.end(JSON.stringify(body));
    };
    const fail = (status: number, code: string) => finish(status, {
      schema_version: "skillspring.transport-error.v1", error: { code }
    });
    req.on("error", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));

    // Reject browser-origin calls and DNS-rebinding hostnames. No CORS grant.
    const address = server.address();
    const expectedHost = typeof address === "object" && address ? `127.0.0.1:${address.port}` : "";
    if (req.headers.host !== expectedHost || req.headers.origin !== undefined) {
      fail(403, "LOCAL_REQUEST_REQUIRED");
      return;
    }
    if (req.url !== "/v1/evaluate") { fail(404, "NOT_FOUND"); return; }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      fail(405, "METHOD_NOT_ALLOWED");
      return;
    }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers["content-type"] ?? "") ||
        req.headers["content-encoding"] !== undefined) {
      fail(415, "UNSUPPORTED_MEDIA_TYPE");
      return;
    }
    if (Number(req.headers["content-length"]) > HTTP_BODY_LIMIT) {
      fail(413, "BODY_TOO_LARGE");
      return;
    }
    if (req.headers.expect?.toLowerCase() === "100-continue") res.writeContinue();
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      if (res.writableEnded) return;
      size += chunk.length;
      if (size > HTTP_BODY_LIMIT) { chunks.length = 0; fail(413, "BODY_TOO_LARGE"); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (res.writableEnded || res.destroyed) return;
      let input: unknown;
      try {
        input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
      } catch { fail(400, "INVALID_JSON"); return; }
      void evaluateV1(input).then(response => {
        finish(response.error?.code === "INVALID_REQUEST" ? 400 : response.error ? 500 : 200, response);
      }).catch(() => fail(500, "INTERNAL_ERROR"));
    });
  });
  // Bound incomplete headers as well as complete-header/slow-body requests.
  server.setTimeout(HTTP_REQUEST_TIMEOUT_MS, socket => socket.destroy());
  server.headersTimeout = HTTP_REQUEST_TIMEOUT_MS;
  server.requestTimeout = HTTP_REQUEST_TIMEOUT_MS;
  server.maxRequestsPerSocket = 1;
  server.on("checkContinue", (req, res) => {
    // Share all header checks and deadlines before inviting the body upload.
    server.emit("request", req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  return server;
}
