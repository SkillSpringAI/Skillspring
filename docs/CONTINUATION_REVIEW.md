# Continuation review — 6 September 2026

This is a targeted implementation-readiness review of the checkpoint's runtime,
candidate, policy/verifier, diagnostic, and publication boundaries. It is not a
complete security audit. No new capability is activated by this review.

## Findings and implications

| Priority | Observed implementation | Implication |
| --- | --- | --- |
| First | `diagnostics/registry-change-protocol.ts` reads working-tree and index diffs and returns early when clean | Clean CI cannot enforce versioned-registry immutability against the commits being reviewed. The local hook is useful but insufficient. |
| First | The same diagnostic accepts any generated registry with a matching version number | A different registry's generated file can satisfy the pairing check. Require exact source-to-output mapping. |
| Next | `scripts/review-policy/verifier.ts` stores keys, revocations, revisions, and observed time in memory | Restart discards trusted observations. It is suitable for the documented simulation, not durable operational verification. |
| Next | `scripts/review-policy/signed-boundary.ts` accepts a caller-selected array of signed reviews | Signatures authenticate supplied records but cannot establish completeness. An omitted rejection is not detected by signature verification alone. |
| Before release | `runtime/answers/candidate.ts` validates provenance and receipts while evidence remains UNVERIFIED and reviews PENDING | Candidate validity is a useful boundary, not a factual-support or release decision. |
| Before execution | `runtime/journal.ts` and `runtime/replay.ts` provide types and limited consistency checks | They do not provide durable execution history, comprehensive replay validation, or proof of side effects. |
| Maintenance | Two GitHub workflows run the same preflight; the legacy run script points to an unsupported built entry point | Consolidate CI deliberately and clarify or repair packaging in a separate small change. |

The repository consistently keeps actual access and release flags false in its
policy simulations. The documented limitations are appropriate; the findings
above become blockers when promoting those simulations into operational use.

## Recommended sequence

### 1. Make change validation meaningful in CI

Implemented in the registry CI validation slice following this review. See
[comparison rules and regression coverage](REGISTRY_CHANGE_VALIDATION.md).
The recommendations below record the scope of that slice.

Use a small `codex/` branch from reconciled `main`. Give registry-change
validation an explicit base/head comparison for committed changes, while
retaining index/worktree checks for local development. Fetch the required history
in CI and fail clearly when a required comparison base is unavailable. Handle
new-branch pushes and pull requests explicitly; do not silently treat a missing
base as an empty diff.

Replace version-number-only matching with exact registry source/output mappings.
Test committed changes in temporary Git repositories: forbidden modification,
valid version addition, missing changelog/index/generated output, unrelated
same-version output, and missing base. These tests should exercise clean checkout
behavior as well as staged changes. Keep the current diagnostic steps intact.

This is the recommended next implementation slice. It closes a concrete gap
exposed during checkpoint publication and makes later governance changes easier
to review. It needs no AWS access or role/catalog decision.

### 2. Add durable trust and complete review history in simulation

Define a storage contract before choosing a production service. An initial local
transactional adapter should persist accepted revision/digest observations,
revocations, stable review identities, and append-only review events per
organization and subject. Verification and observation updates must commit
atomically. Query review history through the trusted store rather than accepting
a caller's chosen subset. Specify how rejection is resolved explicitly; omission
or expiry must not silently erase it.

Acceptance cases: restart after revocation; old snapshot after restart; concurrent
revision conflict; failure during write; corruption or unavailable store;
idempotent replay; omitted rejection; changed candidate/audience/policy binding;
and rejection followed by an attempted approval under a new record ID.

Keep all actual-authority flags false. A local database cannot by itself detect
rollback of the entire database by a compromised host; document that boundary
and the external trusted checkpoint needed for stronger guarantees. Do not call
this production anti-rollback or identity authentication.

### 3. Connect candidate evidence and review contracts

Bind stored reviews to a validated candidate, evidence receipts, policy version,
mode/domain, and intended audience. Define the supported claim/evidence checks
and human responsibilities before creating a release transition. Use synthetic
candidates first. Bedrock can later test model-output variation; model output
must not grant clearance or certify its own authority.

### 4. Review operational integration separately

Choose the external identity/key authority and actual resource catalog, then
design enforcement at the resource with current clearance and revocation checks.
The constitution currently prohibits SkillSpring from authenticating identities
or authorizing restricted-system access. Any proposed activation must resolve
that boundary through the prescribed review/amendment process; it cannot be
enabled by interpreting a simulation result as permission.

## Evidence

Both GitHub workflows passed for `ddcdb70`: [CI](https://github.com/SkillSpringAI/Skillspring/actions/runs/33963248371)
and [preflight](https://github.com/SkillSpringAI/Skillspring/actions/runs/33963248361).
Those runs verify the checkpoint's existing checks, including their limits;
they do not establish complete constitutional or security coverage.

The repository reconciliation preserves the original checkpoint tag. Subsequent
implementation should use focused commits and new checkpoints so review scope
is clear without reconstructing another large accumulated change.
