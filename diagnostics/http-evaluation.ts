import assert from "node:assert/strict";
import { request } from "node:http";
import { connect } from "node:net";
import { startEvaluationServer, HTTP_BODY_LIMIT, HTTP_REQUEST_TIMEOUT_MS } from "../src/http-server.js";
import { evaluateV1 } from "../runtime/api/evaluate.js";
import dualUse from "../datasets/risk-patterns/dual-use-patterns.json";

export async function checkHttpEvaluation(): Promise<void> {
  const server = await startEvaluationServer(0);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  assert.equal(address.address, "127.0.0.1");
  const { port } = address;
  const send = (body: string | Buffer, options: {
    method?: string; path?: string; headers?: Record<string, string>;
  } = {}) => new Promise<{ status: number; body: any; headers: any; continued: boolean }>((resolve, reject) => {
    let continued = false;
    const req = request({ host: "127.0.0.1", port, method: options.method ?? "POST",
      path: options.path ?? "/v1/evaluate", agent: false,
      headers: { "Content-Type": "application/json", ...options.headers }
    }, res => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { text += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode!, body: JSON.parse(text), headers: res.headers, continued }); }
        catch (error) { reject(error); }
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("HTTP diagnostic timed out")));
    if (options.headers?.Expect === "100-continue") {
      req.once("continue", () => { continued = true; req.end(body); });
      req.flushHeaders();
    } else req.end(body);
  });
  try {
    for (const user_input of ["hello", dualUse.patterns[0]]) {
      const input = { schema_version: "skillspring.evaluate.request.v1", user_input };
      const res = await send(JSON.stringify(input));
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, await evaluateV1(input));
      assert.equal(res.headers["cache-control"], "no-store");
      assert.equal(res.headers["access-control-allow-origin"], undefined);
      const handshake = await send(JSON.stringify(input), { headers: {
        Expect: "100-continue", "Content-Length": String(Buffer.byteLength(JSON.stringify(input)))
      } });
      assert.equal(handshake.continued, true);
      assert.equal(handshake.status, 200);
      assert.deepEqual(handshake.body, res.body);
    }
    for (const [body, options, status, code] of [
      ["{", {}, 400, "INVALID_JSON"],
      [Buffer.from([0xff]), {}, 400, "INVALID_JSON"],
      ["{}", {}, 400, "INVALID_REQUEST"],
      [JSON.stringify({ schema_version: "skillspring.evaluate.request.v1", user_input: "hello", meta: { authority_test_overrides: { omit_dla: true } } }), {}, 400, "INVALID_REQUEST"],
      ["{}", { method: "GET" }, 405, "METHOD_NOT_ALLOWED"],
      ["{}", { path: "/v1/evaluate?extra=true" }, 404, "NOT_FOUND"],
      ["{}", { path: "/execute" }, 404, "NOT_FOUND"],
      ["{}", { headers: { "Content-Type": "text/plain" } }, 415, "UNSUPPORTED_MEDIA_TYPE"],
      ["{}", { headers: { "Content-Encoding": "gzip" } }, 415, "UNSUPPORTED_MEDIA_TYPE"],
      ["{}", { headers: { Host: "attacker.example" } }, 403, "LOCAL_REQUEST_REQUIRED"],
      ["{}", { headers: { Origin: "https://example.com" } }, 403, "LOCAL_REQUEST_REQUIRED"],
      ["{}", { headers: { "Content-Length": String(HTTP_BODY_LIMIT + 1) } }, 413, "BODY_TOO_LARGE"],
      ["x".repeat(HTTP_BODY_LIMIT + 1), { headers: { "Transfer-Encoding": "chunked" } }, 413, "BODY_TOO_LARGE"]
    ] as const) {
      const res = await send(body, options);
      assert.equal(res.status, status);
      assert.equal(res.body.error.code, code);
      assert.equal(res.body.result, undefined);
      // Rejected headers must not receive 100 Continue or wait for a body.
      if (status !== 400 && !(options.headers && "Transfer-Encoding" in options.headers)) {
        const handshake = await send(body, { ...options, headers: {
          "Content-Length": String(Buffer.byteLength(body)), ...options.headers, Expect: "100-continue"
        } });
        assert.equal(handshake.continued, false);
        assert.equal(handshake.status, status);
        assert.equal(handshake.body.error.code, code);
      }
    }
    // A body that never completes gets a bounded failure, not evaluation.
    await new Promise<void>((resolve, reject) => {
      const socket = connect(port, "127.0.0.1");
      let response = "";
      const watchdog = setTimeout(() => { socket.destroy(); reject(new Error("body deadline missing")); }, HTTP_REQUEST_TIMEOUT_MS + 3000);
      socket.on("connect", () => socket.write(`POST /v1/evaluate HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{`));
      socket.on("data", data => { response += data.toString(); });
      socket.on("error", reject);
      socket.on("close", () => {
        clearTimeout(watchdog);
        try { assert.match(response, /408/); assert.match(response, /REQUEST_TIMEOUT/); resolve(); }
        catch (error) { reject(error); }
      });
    });
    // Incomplete headers and invalid Expect uploads never enter evaluation.
    for (const [wire, expected] of [
      ["POST /v1/evaluate HTTP/1.1\r\n", null],
      [`POST /v1/evaluate HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nExpect: 100-continue\r\nContent-Length: 10\r\n\r\n`, /415/]
    ] as const) {
      await new Promise<void>((resolve, reject) => {
        const socket = connect(port, "127.0.0.1");
        let response = "";
        const watchdog = setTimeout(() => { socket.destroy(); reject(new Error("header deadline missing")); }, HTTP_REQUEST_TIMEOUT_MS + 3000);
        socket.on("connect", () => socket.write(wire));
        socket.on("data", data => { response += data.toString(); });
        socket.on("error", reject);
        socket.on("close", () => {
          clearTimeout(watchdog);
          try {
            if (expected) assert.match(response, expected);
            assert.equal(response.includes('"result"'), false);
            resolve();
          } catch (error) { reject(error); }
        });
      });
    }
    // Aborted uploads must leave the listener usable.
    await new Promise<void>(resolve => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.write(`POST /v1/evaluate HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Length: 100\r\n\r\n{`);
        socket.destroy();
      });
      socket.on("close", () => resolve());
    });
    assert.equal((await send("{}")).status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
}
