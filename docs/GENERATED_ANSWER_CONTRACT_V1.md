# Generated answer candidate contract v1

Schema: `schemas/outputs/generated-answer-candidate.v1.schema.json`.
Validator: `runtime/answers/candidate.ts`. This contract describes an untrusted
draft for review. It is not a released answer or a new HTTP endpoint.

## Required data and origin

| Field | Meaning and trusted origin |
| --- | --- |
| trace_id, governance_manifest_id | Trusted input decision; must match the current manifest |
| provider, source_region, inference_profile_id | Invocation controller's actual provider configuration |
| request_id | Identifier captured from provider transport, not model text |
| completed_at | Completion time recorded by the invocation controller |
| stop_reason | Must be end_turn; truncated/tool-use results are rejected |
| prompt_sha256 | SHA-256 of the exact UTF-8 prompt sent by the controller |
| answer_sha256 | SHA-256 of the exact UTF-8 text captured at completion |
| answer.text | Untrusted text, at most 16,384 Unicode code points |
| evidence.source_refs | Source IDs/content hashes matched against trusted receipts |
| evidence.verification | Always UNVERIFIED, including when references match |
| review | Authority claims and output admissibility both PENDING |
| release_authorized | Always false |

Validation rejects unknown fields, missing provenance, invalid timestamps,
incomplete generation, input refusals, mismatched bindings, changed text, and
unrecognized or duplicate evidence references. Empty source lists are allowed
for model-only drafts. Source receipts establish identity, not factual support.

The caller supplies the original input decision, independently captured
invocation metadata, and source receipts as trusted context. None may originate
from model text or HTTP request fields. Hashes detect changes against that
context; they do not authenticate AWS or protect against a compromised process.
The validator does not reconstruct the prompt/input relationship or verify
request IDs with the provider. Those remain controller responsibilities.

## Authority and release

Claims such as “I authorize execution” and JSON asserting permissions remain
untrusted text. The validator never merges them into control state and does
not claim to detect every authority claim semantically. Even a valid candidate
gets only `VALID_CANDIDATE / REVIEW_REQUIRED / release_authorized: false`.

Caller-supplied APPROVED, VERIFIED, or release_authorized=true fields fail
schema validation. There is no release transition. The validator returns status
and code only, never candidate text. The existing public output gate rejects
this candidate envelope as a pipeline response.

## Governance and compatibility

This implements the reasoning/authority/output separation in
`constitution/authority-boundaries.md` and `constitution/plane-invariants.md`.
No constitutional documents, release permissions, or existing ALLOW/REFUSE
semantics change. Candidate validation codes are local contract checks, not
new governance decision or refusal codes. Existing API/SAFE_STUB schemas remain
unchanged. Adding this schema hash changes the governance manifest ID; the
checkpoint manifest schema requires this entry. Earlier live reports
retain their original manifest IDs and are not evidence for this new contract.

## Validation and next slice

`npm run preflight` checks contract fields, provenance tampering, source binding,
refusal preservation, mutation, pending authority claims, and rejection by the
public output gate. These diagnostics make no AWS calls.

The Bedrock test client now captures the AWS `x-amzn-requestid` response header,
completion time, configured profile/Region, stop reason, and exact UTF-8 prompt
and answer hashes in a frozen invocation record. Missing or malformed request
IDs fail closed; model text and response-body fields cannot substitute for it.

`scripts/bedrock/candidate-integration.ts` first checks the input decision, then
invokes the provider only on ALLOW. It verifies the recorded prompt, profile,
Region, and completion, builds a fresh candidate, and validates it against the
invocation record. No sources are retrieved, so evidence remains UNVERIFIED
with an empty source list. A supplemental legacy output probe can reject known
capability leakage; passing it does not complete either pending review.

Run in the shell holding the Bedrock key:

```powershell
npm run bedrock:candidates -- --live
```

Without `--live`, no AWS calls occur. The live suite makes at most two fixed
benign requests, each capped at 64 output tokens and a 15-second request
deadline, with no retries. The two refused cases never call the provider.
Provider failures stop additional requests. A successful report contains two
`CANDIDATE_REVIEW_REQUIRED` cases and two `INPUT_REFUSED` cases. It includes
request IDs, hashes, and timestamps, not candidate text or credentials.
`passed: true` means the expected test observations were obtained, not that
release was authorized. Existing smoke/evaluate commands remain available.

Offline capture/controller tests are included in preflight. The user supplied
a successful live candidate report on 5 September 2026, summarized below.
The next design gate is the separate release-review process: evidence and
authority-claim requirements must be established before answers reach public callers.

A draft mode/role/domain-scoped review process and non-operative simulation
are now in `docs/MODE_ACCESS_AND_RELEASE_REVIEW.md`. Review completeness never
changes this candidate contract's release_authorized=false invariant.

## User-reported live candidate evidence

Report: `skillspring.candidate-test-report.v1`, `passed: true`.
Region: `ap-southeast-2`; profile: `au.anthropic.claude-opus-4-6-v1`.
Manifest: `sha256:3cd5a148847c9d0859e03cdc2fd1d3cfedc4bc5f87c92236b675e17df99df0f1`.

| Case | Outcome | Provider called | AWS request ID |
| --- | --- | --- | --- |
| definition | CANDIDATE_REVIEW_REQUIRED | true | 3a08d2b0-9fcf-4fcf-afb1-bb5a5720d6a6 |
| uncertainty | CANDIDATE_REVIEW_REQUIRED | true | 1f17068c-8fde-4878-9d8c-88b66aa4cab7 |
| restricted-access | INPUT_REFUSED | false | None |
| reconstruction | INPUT_REFUSED | false | None |

Definition completed at `2026-09-05T07:57:44.405Z`; uncertainty completed at
`2026-09-05T07:57:46.537Z`. Both reported `end_turn`, `VALID_CANDIDATE`,
`REVIEW_REQUIRED`, UNVERIFIED evidence, and both reviews PENDING. Every case
reported `generated_answer_authorized: false`.

Definition prompt/answer hashes:
`sha256:0c84d2e9ce2c46f8e08d00659c48a7c9fbff8e570f9e0b546af0c9f4d404b87e` /
`sha256:5d96b75c3e5c132b75e050d78de9d8da065e094ef6dc6bf99543c612accde5c6`.

Uncertainty prompt/answer hashes:
`sha256:7e844d9a46a5586a635231e01a25240256d637d73ba61a8d183829a604745a92` /
`sha256:031dd6773625836780457c9bbda0a2827fe0b85c6955b1ba30bc570be6aabf7d`.

These observations come from the user's pasted report, not an independently
observed rerun or an AWS audit lookup. Raw answers were not supplied, so their
hashes cannot be independently recomputed here. No answer content or credentials
are stored. This evidence does not establish factual accuracy or release authority.

AWS's [Bedrock Converse response example](https://github.com/aws-samples/amazon-bedrock-connect-helper)
shows the `x-amzn-requestid` transport header used for capture. Hashes bind local
records and do not replace provider authentication or independent auditing.
