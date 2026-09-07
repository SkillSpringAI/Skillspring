import assert from "node:assert/strict";
import { request, type RequestOptions } from "node:http";
import { startWorkbenchServer, WORKBENCH_BODY_LIMIT } from "../scripts/review-policy/workbench-server.js";

export async function checkWorkbench() {
  const server = await startWorkbenchServer(0);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  function send(path: string, body?: unknown, options: RequestOptions = {}) {
    const text = body === undefined ? undefined : JSON.stringify(body);
    return new Promise<{ status: number; body: any; text: string; headers: import("node:http").IncomingHttpHeaders }>((resolve, reject) => {
      const req = request(`${origin}${path}`, {
        method: text === undefined ? "GET" : "POST", ...options,
        headers: { ...(text === undefined ? {} : { "Content-Type": "application/json", Origin: origin }), ...options.headers }
      }, res => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode!, text, body: res.headers["content-type"]?.includes("application/json") ? JSON.parse(text) : undefined, headers: res.headers });
        });
      });
      req.on("error", reject); req.setTimeout(5000, () => req.destroy(new Error("test timeout"))); req.end(text);
    });
  }
  try {
    const page = await send("/");
    assert.equal(page.status, 200);
    assert.match(page.text, /Candidate review/);
    assert.match(String(page.headers["content-security-policy"]), /frame-ancestors 'none'/);
    assert.equal(page.headers["cache-control"], "no-store");
    for (const asset of ["/app.js", "/style.css"]) assert.equal((await send(asset)).status, 200);
    assert.equal((await send("/v1/evaluate")).status, 404);
    assert.equal((await send("/api/workbench?mode=UNKNOWN")).status, 404);
    assert.equal((await send("/", undefined, { headers: { Host: "evil.example" } })).status, 403);
    assert.equal((await send("/", undefined, { headers: { Origin: "https://evil.example" } })).status, 403);
    assert.equal((await send("/", undefined, { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
    for (const mode of ["DEFAULT", "GOVERNANCE", "ARCHITECT"]) {
      const initial = await send(`/api/workbench?mode=${mode}`);
      assert.equal(initial.status, 200);
      let state = initial.body;
      assert.equal(state.synthetic, true); assert.equal(state.release_authorized, false);
      assert.equal(state.result.review_complete, false); assert.equal(state.history.length, 0);
      assert.equal(state.package.claims.length, 2);
      assert.equal(state.package.candidate.evidence.verification, "UNVERIFIED");
      assert.equal(state.package.candidate.review.authority_claims, "PENDING");
      assert.ok(!initial.text.includes("PRIVATE KEY"));
      const submission = (who: string, revision = 0) => ({ mode, reviewer: who, subject_hash: state.subject_hash,
        expected_revision: revision, decision: "APPROVE",
        claim_checks: state.package.claims.map((claim: { id: string }) => ({ claim_id: claim.id, finding: "SUPPORTED" })),
        authority_claims: "CLEARED", output_admissibility: "PASS"
      });
      const submit = (input: unknown, headers = {}) => send("/api/reviews", input, {
        headers: { "X-Workbench-Token": state.csrf_token, ...headers }
      });
      const who = state.required_reviewers[0];
      if (mode === "DEFAULT") {
        const valid = submission(who);
        assert.equal((await send("/api/reviews", valid)).status, 403);
        assert.equal((await submit(valid, { Origin: "https://evil.example" })).status, 403);
        assert.equal((await submit(valid, { "X-Workbench-Token": "wrong" })).status, 403);
        assert.equal((await submit(valid, { "Content-Type": "text/plain" })).status, 415);
        assert.equal((await submit(valid, { "Content-Length": String(WORKBENCH_BODY_LIMIT + 1) })).status, 413);
        assert.equal((await send("/api/reviews", undefined, { method: "PUT" })).status, 405);
        for (const invalid of [{ ...valid, release_authorized: true }, { ...valid, reviewer: "alice" },
          { ...valid, claim_checks: [valid.claim_checks[0], valid.claim_checks[0]] },
          { ...valid, claim_checks: [] }, { ...valid, authority_claims: "APPROVED" }]) {
          assert.equal((await submit(invalid)).status, 400);
        }
        assert.equal((await submit({ ...valid, subject_hash: `sha256:${"0".repeat(64)}` })).status, 409);
        assert.equal((await send(`/api/workbench?mode=${mode}`)).body.history.length, 0);
      }
      const uncertain = submission(who);
      uncertain.claim_checks[0].finding = "UNCERTAIN";
      const pending = await submit(uncertain);
      assert.equal(pending.status, 200); assert.equal(pending.body.result.review_complete, false);
      assert.equal(pending.body.history.length, 1);
      // Same revision from a stale tab cannot overwrite the saved uncertainty.
      assert.equal((await submit(submission(who))).status, 409);
      state = pending.body;
      for (const reviewer of state.required_reviewers) {
        const revision = reviewer === who ? 1 : 0;
        const saved = await submit(submission(reviewer, revision));
        assert.equal(saved.status, 200);
        state = saved.body;
        if (reviewer === who && mode !== "DEFAULT") assert.equal(state.result.review_complete, false);
      }
      assert.equal(state.result.review_complete, true); assert.equal(state.result.release_authorized, false);
      const refreshed = (await send(`/api/workbench?mode=${mode}`)).body;
      assert.equal(refreshed.history.length, state.history.length); assert.equal(refreshed.result.review_complete, true);
      const rejection = await submit({ ...submission(who, 2), decision: "REJECT" });
      assert.equal(rejection.status, 200); assert.equal(rejection.body.result.reason, "REVIEW_REJECTED");
      state = rejection.body;
      const later = await submit(submission(who, 3));
      assert.equal(later.status, 200); assert.equal(later.body.result.reason, "REVIEW_REJECTED");
      const after = (await send(`/api/workbench?mode=${mode}`)).body;
      assert.equal(after.result.review_complete, false); assert.equal(after.result.release_authorized, false);
      assert.equal(after.history.at(-2).record.decision, "REJECT");
      assert.equal(after.package.candidate.release_authorized, false);
    }
  } finally {
    await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
  }
}

if (process.argv[1] && /workbench\.(ts|js)$/.test(process.argv[1])) {
  checkWorkbench().then(() => console.log("DIAG workbench: PASS")).catch(error => { console.error(error); process.exitCode = 1; });
}
