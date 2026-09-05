# SkillSpring

SkillSpring is a constitution-first governance research runtime. It evaluates
inputs through deterministic policy, authority, evidence, and output checks.
The local API returns a governed refusal or an intentionally inert `SAFE_STUB`;
it does not execute tools or release model-generated answers.

**Checkpoint:** `checkpoint-2026-09-05-governance-candidates-signed-policy`.
This reviewed milestone includes local HTTP evaluation, opt-in AWS Bedrock tests,
provenance-bound answer candidates, and non-operative access/review simulations
with signed inputs. It is not a production security boundary or an autonomous agent.

## Implemented surfaces

| Surface | Current behavior |
| --- | --- |
| Governance pipeline | Classification, policy decisions, DLA/Permission Token checks, Lumens verification, evidence assessment, and output gating |
| Provenance | Generated registries and governance manifest; results bind to the manifest ID |
| Local API | Strict versioned evaluateV1 contract and loopback-only POST /v1/evaluate |
| Bedrock tests | Explicit live commands using Sydney and au.anthropic.claude-opus-4-6-v1; fixed synthetic prompts |
| Answer candidates | Request IDs, prompt/answer hashes, evidence references, and pending-review contract; release remains false |
| Access/review simulation | Draft role/domain/mode scopes, purpose/environment constraints, denial precedence, and recipient-access checks |
| Signed policy inputs | Ed25519 verification, signer binding, rotation/revocation, and in-memory revision checks |
| Execution lifecycle | Authority, lifecycle, journal, and replay contracts/diagnostics; no real executor or durable store |

The model test harness is separate from the public evaluation API. Policy
simulations always retain false actual-authority flags, including when their
hypothetical checks pass. Modes narrow independently granted scope; switching
to Governance or Architect does not grant privileges.

## Run locally

Use Node.js 24 and npm. Windows PowerShell is the exercised local workflow;
GitHub workflows configure Node.js 24 on Ubuntu. Windows installation also
configures the repository's pre-commit hook.

```powershell
npm ci
npm run preflight
npm run dev -- "Explain governance."
```

Preflight compiles TypeScript and runs **35 diagnostic steps** without AWS calls.
Supported launch commands use tsx. The build is not a packaged distribution;
the legacy `npm run run` script is not a supported launch path at this checkpoint.

Start the local API:

```powershell
npm run serve
```

In another PowerShell window:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8787/v1/evaluate -Method Post -ContentType application/json -Body '{"schema_version":"skillspring.evaluate.request.v1","user_input":"Explain governance."}' | ConvertTo-Json -Depth 10
```

Opening the URL in a browser sends GET and returns `METHOD_NOT_ALLOWED`; this
is an API endpoint, not a web UI. The server enforces JSON/body limits, deadlines,
and host/origin checks, and supports PowerShell's 100-continue handshake.
Press Ctrl+C in the server window to stop it. See the
[API contract](docs/EVALUATION_API_V1.md) for limits and errors.

## Optional Bedrock tests

Set `AWS_BEARER_TOKEN_BEDROCK` locally using [Bedrock setup](docs/BEDROCK_TESTING.md).
Keep credentials out of source files, command literals, and shared reports.
Without `--live`, these commands make no AWS calls. Live calls incur inference charges.

| Command | Maximum requests | Purpose |
| --- | --- | --- |
| `npm run bedrock:smoke -- --live` | 1 | Connectivity and generated-text input evaluation |
| `npm run bedrock:evaluate -- --live` | 2 | Allowed/refused inputs and legacy output probes |
| `npm run bedrock:candidates -- --live` | 2 | Captured provenance and candidate-contract validation |

Requests use fixed benign prompts, at most 64 output tokens each, a 15-second
network deadline, and no automatic retries. Refused cases do not call AWS.
Reports omit generated text and credentials. Successful live reports were
supplied by the user and are recorded in the docs; they do not establish
generated-answer release authority or factual accuracy.

## Limits that matter

- No operational identity provider, grants, real resource enforcement, autonomous
  execution, or generated-answer release transition.
- Verifier history and revocation state reset on restart. Complete authenticated
  review history and durable rollback protection are absent.
- The local server assumes trusted local clients; it is not remotely authenticated
  or ready for public deployment.
- Hashes bind data but do not prove evidence truth. Candidate reviews remain pending.
- Keyword/import checks and passing diagnostics cover tested cases, not every
  attack or complete constitutional enforcement.

## Repository guide

| Path | Contents |
| --- | --- |
| constitution/ | Normative laws, authority boundaries, plane invariants, amendment protocol |
| runtime/ | Governance pipeline, authority/lifecycle contracts, candidate validation |
| src/ | CLI and local HTTP entry points |
| schemas/ | Runtime contracts, registries, manifest, and explicitly draft policy schemas |
| datasets/ | Informational risk/regulatory/evaluation inputs; not authority |
| scripts/bedrock/ | Opt-in provider tests |
| scripts/review-policy/ | Non-operative scoped-policy and signed-verifier simulations |
| diagnostics/ | Offline structural, behavioral, HTTP, cryptographic, and integration tests |

Start with [current state](docs/CURRENT_STATE.md) and the
[reviewed handoff](docs/REVIEW_HANDOFF.md). Detailed designs cover
[answer candidates](docs/GENERATED_ANSWER_CONTRACT_V1.md),
[mode/access review](docs/MODE_ACCESS_AND_RELEASE_REVIEW.md),
[scoped policy checks](docs/SCOPED_POLICY_BOUNDARY.md), and
[signed policy verification](docs/SIGNED_POLICY_VERIFIER.md).

Read [contributing](CONTRIBUTING.md), [governance](GOVERNANCE.md),
[security](SECURITY.md), and [engineer guidance](docs/INTERNAL_ENGINEER_HANDOFF.md)
before extending enforcement or integrating capabilities.

## License and contact

[ISC License](LICENSE). Separate commercial or confidential extensions require
their own agreement. Contact: contact.skillspringai@gmail.com.
