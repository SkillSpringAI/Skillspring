# SkillSpring current state

Checkpoint: `checkpoint-2026-09-05-governance-candidates-signed-policy`.
This reviewed milestone incorporates governance corrections and integration
slices developed from baseline `458f5a4` (4 April 2026). The enclosing checkpoint
commit/tag identifies the implementation described here.

## Implemented runtime and interfaces

- Deterministic classification, policy/refusal assembly, DLA and Permission
  Token validation, Lumens checks, evidence assessment, and output gating.
- Generated invariant/failure registries, decision-code checks, trigger bindings,
  constitution-to-implementation mapping, and manifest freshness/result binding.
- Versioned evaluateV1 input/output contracts and local-only POST /v1/evaluate,
  with JSON/body limits, timeouts, host/origin checks, PowerShell handshake
  support, and HTTP diagnostics.
- Generated-answer candidate schema/validator: trace/manifest binding, invocation
  provenance, answer hash, source receipts, and mandatory pending review.
- Action-bound execution authority, lifecycle states including UNCERTAIN,
  journal/replay contracts, and diagnostics. No real executor or durable store.

The local API emits SAFE_STUB or refusal. Its classifier's processing mode does
not establish an authenticated access workspace or grant privileges.

## Implemented experimental tooling

- Bedrock tests use Sydney (ap-southeast-2) and au.anthropic.claude-opus-4-6-v1.
  Live calls require explicit --live commands; preflight uses fake providers.
- The client captures AWS request IDs, completion time, profile/Region, stop
  reason, and exact prompt/answer hashes. Candidate tests validate provenance
  against separately constructed envelopes without printing raw answers.
- Draft access/review simulations restrict Default to registered public
  resources, require domain clearance for Governance, and scope Architect to
  engineering sandbox work. Roles are starter bundles, not a fixed privilege ladder.
- Draft policy schemas check organization, purpose/environment, denial precedence,
  snapshot integrity/expiry, policy digest, and audience read eligibility.
- Ed25519 snapshot/review verification binds signers, organization, revisions,
  validity, and payloads. Revocation, replacement keys, and rollback/conflict
  checks operate within one in-memory verifier instance.

All policy simulations retain false actual-authority flags. Draft review-policy
schemas are not active authority and are outside the runtime governance manifest.

## Verification and live evidence

`npm run preflight` passes compilation and **35 diagnostic steps**.
`git diff --check` passes. The local workflow was exercised on Windows. Existing
GitHub workflows install dependencies and run preflight with Node.js 24 on Ubuntu;
local success does not imply an unobserved remote workflow passed.

| User-reported AWS suite | Result | Evidence boundary |
| --- | --- | --- |
| Smoke | Connected; 254 characters; end_turn; input evaluation ALLOW | Connectivity only |
| Integration | Two output probes passed; two inputs refused before provider calls | Four controlled cases; no release authority |
| Candidates | Two VALID_CANDIDATE/REVIEW_REQUIRED cases; two inputs refused | Contract/provenance checks; evidence UNVERIFIED and both reviews PENDING |

Smoke/integration reports bind to
`sha256:db898761933265c709f09ae3745d54e9309a70a4e57158f09c7ee7274b9fc8bb`.
The later candidate report binds to the current runtime manifest:
`sha256:3cd5a148847c9d0859e03cdc2fd1d3cfedc4bc5f87c92236b675e17df99df0f1`.
Request IDs, timestamps, and hashes are preserved in
`docs/GENERATED_ANSWER_CONTRACT_V1.md`. These are user-supplied reports, not
independently observed reruns or AWS audit lookups. Raw answers were not supplied
for independent hash recomputation.

## Absent capabilities and limitations

- No final answer-release controller, real resource enforcement, tool executor,
  or autonomous agent behavior.
- No production identity integration, remotely authenticated API, operational
  grant issuance, key-management service, or authenticated review-history store.
- Verifier state resets on restart. Durable rollback prevention, multi-process
  coordination, revocation-at-use, and complete review history remain unsolved.
  A signature alone cannot establish that no rejection was omitted.
- Evidence hashes do not prove factual support. Semantic authority-claim review
  and final answer admissibility remain pending.
- Dataset/keyword/import checks are regression evidence, not a complete security
  boundary or proof of constitutional coverage.
- Build compiles source for checking; supported launch commands use tsx. The
  legacy npm run run path is not a supported built distribution.

## Review outcome and remaining decisions

The user reviewed the edits and new code and authorized checkpoint publication.
Code review does not grant operational access or answer-release permission.
See `docs/REVIEW_HANDOFF.md` for the checkpoint scope and review map.

Before operational integration, select a trusted external identity/key source,
design durable snapshot/revocation and complete review history, settle the actual
role/domain/resource catalog, and define evidence/authority-claim requirements
for answer release. Expansion beyond constitutional authority requires the
formal amendment process. Those next design tasks are not implemented.
