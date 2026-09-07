# SkillSpring current state

Checkpoint: `checkpoint-2026-09-05-governance-candidates-signed-policy`.
This reviewed milestone incorporates governance corrections and integration
slices developed from baseline `458f5a4` (4 April 2026). The enclosing checkpoint
commit/tag identifies the implementation described here. Current `main` is the
default maintained line and may contain later corrections and documentation;
the checkpoint tag remains fixed. See `docs/REPOSITORY_STATE.md`.

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
- Optional SQLite simulation history persists signed observations, revocations,
  stable review identities, and blocking rejections. Transactions serialize
  checks across processes; failed writes and pre-commit crashes roll back.
  See `docs/DURABLE_POLICY_HISTORY.md` for the fixed trust configuration and limits.
- Candidate review packages bind a validated draft and trusted context to source
  artifacts, complete answer spans, evidence excerpts, and the intended scope.
  Stored signed assessments must cover each claim and satisfy current reviewer
  and recipient clearances. See `docs/CANDIDATE_EVIDENCE_REVIEW.md`.

All policy simulations retain false actual-authority flags. Draft review-policy
schemas are not active authority and are outside the runtime governance manifest.

The local [review workbench](REVIEW_WORKBENCH.md) provides an interactive
synthetic draft/source inspection and signed test-assessment workflow. It uses
session-only SQLite history, separate from the evaluation API, with no real
identity, external candidate ingestion, or answer-release transition.

## Verification and live evidence

`npm run preflight` includes compilation, a compiled CLI smoke test, and
**39 diagnostic steps**. Added
fixtures exercise CI registry comparisons, durable-history failure cases, and
candidate evidence/assessment checks in all three modes;
see `docs/REGISTRY_CHANGE_VALIDATION.md` and `docs/DURABLE_POLICY_HISTORY.md`.
The original checkpoint had 35 steps.
`git diff --check` passes. The local workflow was exercised on Windows. Existing
GitHub workflows install dependencies and run preflight with Node.js 24 on Ubuntu;
both GitHub workflows were also observed passing for checkpoint commit `ddcdb70`.
This evidence applies to that commit, not automatically to later changes.

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
  grant issuance, key-management service, or production review-history service.
- The in-memory verifier resets on restart. The local durable adapter preserves
  accepted history but cannot prove external completeness or detect restoration
  of a consistent older database. Revalidation at a real resource remains absent.
- Evidence hashes do not prove factual support. Candidate review checks signed
  declarations of support and authority/output inspection; it cannot prove the
  declarations true or that a human performed them. Final answer release remains absent.
- Dataset/keyword/import checks are regression evidence, not a complete security
  boundary or proof of constitutional coverage.
- The compiled CLI is supported locally after `npm run build`, using
  `npm run run -- "Explain governance."`. This is not a published distribution.
  Current authority/replay corrections and their review status are recorded in
  [the development slice log](DEVELOPMENT_SLICES.md).

## Review outcome and remaining decisions

The user reviewed the edits and new code and authorized checkpoint publication.
Code review does not grant operational access or answer-release permission.
See `docs/REVIEW_HANDOFF.md` for the checkpoint scope and review map.

Before operational integration, select a trusted external identity/key source,
design operational trust migration and external history guarantees, settle the actual
role/domain/resource catalog, and define evidence/authority-claim requirements
for answer release. Expansion beyond constitutional authority requires the
formal amendment process. Those next design tasks are not implemented.
