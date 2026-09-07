import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { createWorkbench, WorkbenchError } from "./workbench.js";

export const WORKBENCH_BODY_LIMIT = 16384;
/** Separate loopback-only synthetic workbench. Never extends the public evaluation API. */
export async function startWorkbenchServer(port = 8788) {
  const assets = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
    ["/style.css", ["style.css", "text/css; charset=utf-8"]]
  ].map(([route, [file, type]]) => [route, { type, body: readFileSync(resolve("src/workbench", file)) }]));
  const base = realpathSync(tmpdir()), root = mkdtempSync(join(base, "skillspring-workbench-"));
  const cleanup = () => {
    const target = realpathSync(root), within = relative(base, target);
    if (!within || within.startsWith("..") || isAbsolute(within)) throw new Error("INVALID_CLEANUP_PATH");
    rmSync(target, { recursive: true, force: true });
  };
  let workbench: Awaited<ReturnType<typeof createWorkbench>>;
  try { workbench = await createWorkbench(root); } catch (error) { cleanup(); throw error; }
  const token = randomBytes(32).toString("hex");
  const server = createServer({ maxHeaderSize: 8192, connectionsCheckingInterval: 250 }, (req, res) => {
    const timer = setTimeout(() => fail(408, "REQUEST_TIMEOUT"), 2000);
    const finish = (status: number, value: unknown, type = "application/json; charset=utf-8") => {
      if (res.destroyed || res.writableEnded) return;
      clearTimeout(timer);
      res.writeHead(status, {
        "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        "Connection": "close"
      });
      res.end(Buffer.isBuffer(value) ? value : JSON.stringify(value));
    };
    const fail = (status: number, code: string) => finish(status, { error: { code } });
    const handleError = (error: unknown) => error instanceof WorkbenchError
      ? fail(error.status, error.code) : fail(503, "WORKBENCH_UNAVAILABLE");
    req.on("error", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));
    const address = server.address();
    const host = typeof address === "object" && address ? `127.0.0.1:${address.port}` : "";
    const origin = `http://${host}`;
    if (req.headers.host !== host || (req.headers.origin !== undefined && req.headers.origin !== origin) ||
        (req.headers["sec-fetch-site"] !== undefined && !["same-origin", "none"].includes(String(req.headers["sec-fetch-site"])))) {
      fail(403, "LOCAL_REQUEST_REQUIRED"); return;
    }
    if (req.method === "GET") {
      const asset = assets.get(req.url ?? "");
      if (asset) { finish(200, asset.body, asset.type); return; }
      const match = /^\/api\/workbench\?mode=(DEFAULT|GOVERNANCE|ARCHITECT)$/.exec(req.url ?? "");
      if (!match) { fail(404, "NOT_FOUND"); return; }
      try { finish(200, { ...workbench.state(match[1]), csrf_token: token }); } catch (error) { handleError(error); }
      return;
    }
    if (req.url !== "/api/reviews") { fail(404, "NOT_FOUND"); return; }
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); fail(405, "METHOD_NOT_ALLOWED"); return; }
    if (req.headers.origin !== origin || req.headers["x-workbench-token"] !== token) {
      fail(403, "WORKBENCH_REQUEST_REQUIRED"); return;
    }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers["content-type"] ?? "") || req.headers["content-encoding"] !== undefined) {
      fail(415, "UNSUPPORTED_MEDIA_TYPE"); return;
    }
    if (Number(req.headers["content-length"]) > WORKBENCH_BODY_LIMIT) { fail(413, "BODY_TOO_LARGE"); return; }
    if (req.headers.expect?.toLowerCase() === "100-continue") res.writeContinue();
    const chunks: Buffer[] = []; let size = 0;
    req.on("data", (chunk: Buffer) => {
      if (res.writableEnded) return;
      size += chunk.length;
      if (size > WORKBENCH_BODY_LIMIT) { chunks.length = 0; fail(413, "BODY_TOO_LARGE"); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (res.destroyed || res.writableEnded) return;
      let input: unknown;
      try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { fail(400, "INVALID_JSON"); return; }
      try { finish(200, { ...workbench.submit(input), csrf_token: token }); } catch (error) { handleError(error); }
    });
  });
  server.setTimeout(2000, socket => socket.destroy());
  server.headersTimeout = 2000; server.requestTimeout = 2000; server.maxRequestsPerSocket = 1;
  server.on("checkContinue", (req, res) => server.emit("request", req, res));
  server.once("close", () => { workbench.close(); cleanup(); });
  try {
    await new Promise<void>((done, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); done(); });
    });
  } catch (error) { workbench.close(); cleanup(); throw error; }
  return server;
}
