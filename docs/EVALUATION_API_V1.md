# Evaluation boundary v1

The public programmatic entry point is `runtime/api/evaluate.ts`:

```ts
import { evaluateV1 } from "../runtime/api/evaluate.js";

const response = await evaluateV1({
  schema_version: "skillspring.evaluate.request.v1",
  user_input: "Explain governance."
});
```

Requests must be JSON objects containing exactly those two fields. Input text
must contain a non-whitespace character and be at most 16,384 Unicode code
points (JSON Schema string-length semantics). Metadata, diagnostic overrides,
authority artifacts, mode selection, and unknown fields are rejected.

Responses carry `schema_version: "skillspring.evaluate.response.v1"` and
exactly one of `result` or `error`. `result` is the existing admissibility-gated
pipeline output, including its policy and governance manifest ID. A governance
refusal is a valid evaluation result, not an API error. `INVALID_REQUEST` means
the request contract failed; `EVALUATION_FAILED` means evaluation could not
produce a valid governed result. Errors expose neither internal exceptions nor
request contents. They are boundary failures, not governance decisions.

The boundary constructs a fresh pipeline input with only `user_input`.
It adds no authority and retains the inert execution stub. The low-level
pipeline remains an internal interface with diagnostic controls. The API is
for JSON data in a trusted local process, not sandboxing hostile JavaScript
objects or protecting against callers who can directly import internal code.

Both API schemas are hashed into the governance manifest. Existing pipeline
output and decision-code contracts are reused without semantic changes.
Adding the schema hashes changes the manifest ID; consumers must not pin the
previous local ID. This checkpoint includes the preceding governance corrections.

Run `npm run preflight` for build and diagnostics. The API diagnostic checks
invalid versions, missing/extra fields, blank/oversized text, authority
injection, internal-error redaction, response exclusivity, and exact output
preservation against the pipeline for both risk-pattern datasets.

## Local HTTP transport

Approved by the user and implemented on 5 September 2026. Start with
`npm run serve`, then call the endpoint from a local non-browser client:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8787/v1/evaluate -Method Post -ContentType application/json -Body '{"schema_version":"skillspring.evaluate.request.v1","user_input":"Explain governance."}'
```

The listener uses port 8787. Library diagnostics use an ephemeral local port.
Ctrl+C shuts down the CLI listener. Importing the server module does not start
a listener. Tests close all sockets and the server on completion.

Implemented scope:

- A single loopback listener at `127.0.0.1`, exposing only `POST /v1/evaluate`.
- JSON-only requests, bounded body bytes, request timeouts, and deterministic
  transport errors. No request-body logging or external execution.
- Explicit negative-capability test coverage permitting only the adapter's
  server import while continuing to prohibit network imports in the core.
- HTTP tests for malformed/oversized bodies, methods, routes, disconnects,
  timeouts, and preservation of allow/refuse decisions.
- No remote binding, deployment, authentication claims, or outbound requests.

The negative-capability exception permits only the exact `createServer`
import in `src/http-server.ts`. Core imports and HTTP client imports remain
prohibited. These source checks are regression tripwires, not a sandbox.

The byte limit is 131,072 (128 KiB), independently of the programmatic text
length limit. UTF-8 decoding is strict. Only `application/json`, optionally
with `charset=utf-8`, is accepted; content encodings are rejected. Body
completion has a two-second deadline. Incomplete headers are subject to
Node's header deadline checks and socket inactivity timeout. Protocol/parser
errors can close the connection or return Node's native HTTP error; they are
not promised the application JSON envelope. `Expect: 100-continue` is supported
for Windows PowerShell compatibility: header checks run before the server
invites the body upload, and the same body limit and deadline still apply.

Successful evaluation, including governance refusal, returns HTTP 200 with
the v1 evaluation response. Invalid request contracts return 400; evaluation
failure returns 500. Transport errors use `skillspring.transport-error.v1`
with `error.code`: `INVALID_JSON` (400), `LOCAL_REQUEST_REQUIRED` (403),
`NOT_FOUND` (404), `METHOD_NOT_ALLOWED` (405), `REQUEST_TIMEOUT` (408),
`BODY_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415), or `INTERNAL_ERROR`
(500). Responses disable caching and close the connection.

Host must exactly match `127.0.0.1:<listener port>` and Origin must be absent.
This is a trusted-local-client interface, not authentication or protection
against another process on the host. Do not expose it through a remote proxy.

## Future AI integration testing

The user selected AWS Bedrock in Sydney with `au.anthropic.claude-opus-4-6-v1`.
The test-only client is documented in `docs/BEDROCK_TESTING.md`, including the
user-reported successful live smoke test. The HTTP endpoint remains independent of Bedrock.
Model output is untrusted test data and must not choose authority or replace
deterministic policy gates.

## Transport timeout responses

An incomplete upload may receive a bare HTTP 408 Request Timeout from Node or
the application's JSON REQUEST_TIMEOUT error, depending on which deadline fires
first. Clients must handle both. Neither response contains an evaluation result.
