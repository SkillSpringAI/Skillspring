# Development slices and issue log

Each slice records scope, implementation decisions, verification, discovered
issues, and review status. Complete the review of one slice before beginning
the next. Local verification does not imply user approval or publication.

## Slice 1 — Authority, replay, dependencies, and compiled launch

Date: 7 September 2026. Status: implemented, locally verified, and approved by
the user before authorizing slice 2. No commit or publication is implied.

### Scope and governing rules

These corrections implement explicit bounded authority, CP-1 (Control Plane
supremacy), CPI-2 (validated interfaces), CPI-3 (fail closed), and Immutable
Laws III/V (integrity and stewardship). They do not amend the constitution,
activate execution, or authorize candidate release.

| Issue | Change | Regression evidence |
| --- | --- | --- |
| S1-01: future-issued authority, invalid clocks, and NaN risk could pass | Require a valid clock, finite non-negative risk values, and issued_at <= now < expires_at | Issuance/expiry boundaries; invalid date; NaN, infinity, and negative values in both risk fields |
| S1-02: replay accepted unproven completion and mismatched authority | Validate journal kinds/statuses/IDs, authority continuity, unique action IDs, counts, uncertainty, and plan/action status compatibility | Wrong authority, duplicate IDs, unproven completion, inconsistent counts/statuses, malformed records, and valid completed/running/failed/uncertain snapshots |
| S1-03: unfinished prerequisites permitted dependent execution | Require COMPLETED and explicit outcome proof | Every lifecycle state with absent, false, and true proof |
| S1-04: compiled CLI had wrong path and module format | Point run to dist/src/cli.js and emit dist/package.json declaring CommonJS | Compiled allow/refuse/missing-input cases launched from an external working directory |
| S1-05: discovered during implementation: equal/reversed authority validity windows passed schema validation | Add cross-field validation to both builder and validator | Equal/reversed windows rejected by builder, validator, and revalidator |

### Contract and provenance decisions

- `INVALID_CONTEXT` and `NOT_YET_VALID_AUTHORITY` are internal authority
  revalidation result codes. They are not emitted public refusal `failure_code`
  values, so no failure registry version is changed.
- Authority JSON shape is unchanged. Cross-field time ordering is checked in
  code because the existing schema does not express that relationship.
- `isDependentExecutionAllowed(status, outcomeProven = false)` now requires
  explicit proof. Existing one-argument calls fail closed; no operational
  callers exist in this repository. The boolean remains a caller assertion,
  not independently verified evidence or an execution grant.
- Replay checks snapshot consistency, not a complete event history, signatures,
  timestamps, side-effect evidence, or external authority authenticity. An
  uncertain plan may contain proven completed actions alongside uncertainty;
  a terminal plan cannot contain an actively running action. Preparatory plans
  cannot contain actions beyond their lifecycle phase. This is one-plan,
  one-authority journal semantics; per-action authority needs a future contract.
- The source package remains ESM for tsx; compiled files remain CommonJS in an
  explicit nested package. This avoids a repository-wide import migration.
- No manifest inputs, public JSON schemas, or versioned registries changed.
  The manifest therefore remains unchanged. It does not fingerprint runtime
  implementation; identify this slice by its eventual code commit as well.

### Verification

`npm run preflight` passed locally on Node 24.14.0 / Windows: TypeScript build,
compiled CLI allow/refuse/missing-input smoke checks, and all 38 diagnostic
steps, including the expanded authority/lifecycle and replay cases. Targeted
checks also passed. `git diff --check` passed; tracked changes and new files
were inspected. No AWS calls were made. Ubuntu CI has not run for this slice.

Review outcome: no additional blocker was found within this bounded slice.
The user reviewed and approved the local build and stricter helper behavior. The
simulation and operational limitations below remain explicit follow-up work.

### Remaining issues and subsequent slices

| Slice | Scope | Review gate |
| --- | --- | --- |
| 2 | Local candidate-review workbench | Inspect drafts, source passages, claim bindings, assessments, and rejection reasons; preserve simulation-only authority |
| 3 | Labeled policy evaluation corpus | Report false positives and missed detections, including paraphrases and Unicode cases |
| 4 | Durable-history longevity | Benchmark replay cost and design capacity handling, key migration, and explicit rejection resolution |
| 5 | CI and provenance cleanup | Consolidate duplicate workflows and bind reports to code revision plus governance manifest |

Open integration limits: replay declarations do not prove outcomes; one-use
consumption and revocation require a trusted atomic service before execution;
the current authority helper is not an authenticated operational grant verifier.
The existing durable simulation still has a 10,000-event capacity and full replay
under a write lock. These remain scoped follow-up work, not claims of this slice.

## Slice 2 — Local candidate-review workbench

Date: 8 September 2026. Status: implemented and locally verified;
pending user review. Slice 1 was approved before this work began.

Scope: inspect synthetic drafts, Unicode claim spans, bound source excerpts,
provenance, reviewer findings, status/reasons, and accepted history through a
local working interface. Record per-claim support, authority/output findings,
and rejection using server-side test signers and the existing durable boundary.
See [workflow, HTTP boundary, and lifetime](REVIEW_WORKBENCH.md).

Governing constraints: Authority Boundaries permit labeled non-operative
simulations; CPI-2 requires explicit validated interfaces; CPI-3 requires failure
to close the path. The workbench is outside public evaluation and cannot grant
access, authenticate reviewers, or release generated answers. Only fixed
synthetic artifacts can cross this new presentation surface.

| Issue found during the slice | Resolution or remaining boundary |
| --- | --- |
| S2-01: browser requests cannot use the evaluation API, which rejects all Origin headers | Added a separate loopback workbench server with exact same-origin writes, a process token, strict contracts, limits, and CSP; evaluation API unchanged |
| S2-02: test fixture signing closures previously lived in diagnostics | Moved the reusable synthetic fixture into scripts/review-policy; diagnostics re-export it; API returns only explicit presentation data, never keys or signing functions |
| S2-03: uncertain selections could be mistaken for positive approval | New fields default uncertain; positive qualification comes from the durable candidate boundary; UI distinguishes recorded findings from review completion |
| S2-04: stale tabs or retries could overwrite a newer assessment | Subject binding and expected revision required; stale submissions return 409; UI requires refresh after uncertain write outcomes |
| S2-05: fixture expiry and missing artifact/key retention prevent honest process-restart continuity | Fixed simulation time is visible; stores are session-only, with refresh persistence and explicit new-session semantics on restart; real retention deferred |
| S2-06: positive later findings could visually obscure an earlier rejection | History includes every accepted revision and the authoritative status remains blocked; no rejection-clear operation |
| S2-07: full preflight rejected the workbench listener under src | Moved its server/entry point to the experimental scripts/review-policy area; preserved the core import restrictions and added a tripwire against importing review-policy into runtime/src |

Contract/provenance impact: added only a local synthetic workbench contract and
adapter. No existing review/candidate schema, policy, registry, constitutional
text, or active manifest input changed. Real provider reports remain untouched.
The frontend uses existing dependencies and native browser controls.

Verification: `npm run preflight` passed on Node 24.14.0 / Windows: TypeScript
build, browser JavaScript syntax check, compiled CLI smoke tests, and all 39
diagnostic steps. Targeted HTTP workbench diagnostics also passed across all
three modes. The first compile of the diagnostic found a header union-type
mismatch; corrected by normalizing the assertion input to string. The initial
core capability failure is recorded as S2-07 above. Final `git diff --check`
passed. Tracked changes and new implementation files were inspected. No AWS
calls were made. The preview route returned HTTP 200; its process was stopped
after validation. Browser interaction/visual QA and Ubuntu CI have not been run.

Review checkpoint: assess the synthetic workflow, uncertainty wording, test
reviewer roles, rejection persistence, and session lifetime before slice 3.
