# Mode-scoped access and release review — draft v1

Status: non-operative design and executable simulation. This is a configurable
starting policy, not an active identity system, filesystem permission mechanism,
or release authorization. The user requested differentiated Default, Governance,
and Architect workspaces with explicit role/domain clearance.

## Modes select scope; external authorities grant it

The constitution states: “Modes influence behavior, not power.” The canonical
mode registry likewise prohibits authority expansion. This design keeps those
rules: effective scope is the intersection of externally granted entitlements,
role, domain, resource classification, permitted operation, active clearance,
and the selected access mode. Any missing or conflicting condition denies.

The current text classifier can label ordinary input ARCHITECT based on words
such as governance. That processing mode must never select an elevated access
workspace. An authenticated user explicitly requests an access mode in a future
session layer; the external clearance service verifies eligibility first.
Increasing reasoning strictness does not change that session's entitlements.

| Workspace | Default scope | Who may issue access clearance | Proposed answer reviewers |
| --- | --- | --- | --- |
| Default | Registered public resources: read and request review only | Access administrator under a deployment/domain owner's explicit baseline mandate | One independent domain reviewer |
| Governance | Registered public and domain-restricted resources: read, audit/evidence review, request review | Access administrator with an explicit domain mandate for domain-reviewer or governance-officer roles | Domain reviewer plus governance officer, distinct people |
| Architect | Registered public and engineering-sandbox resources: read, test, debug, propose improvements | Access administrator with an engineering-domain mandate for engineering-maintainer roles | Engineering maintainer plus governance officer, distinct people |

All workspaces require a recorded grant, including the Default baseline. A
deployment may provision a narrowly scoped baseline in advance; the runtime
does not invent it. Governance and Architect require explicit clearance before
entry, with an active role and domain assignment. Neither inherits the other's
restricted resources. Architect is not superuser access or permission to alter
production, credentials, constitutional policy, or the permission system.

The administrator issues grants but is not automatically a reviewer or reader.
The domain owner establishes the issuer's mandate outside SkillSpring. The
simulator requires that mandate and prevents self-issued grants. It does not
implement delegation, IAM authentication, signatures, or real grant issuance.
Review clearance is a distinct operation; granting data access does not confer
approval authority, and reviewer status does not confer broad data access.

## Paths and domains

The examples use exact logical resource IDs: `public/guide`, `domain/audit`,
`sandbox/tests`, and `protected/constitution`. They are not filesystem paths
and do not affect these repository directories. Unknown IDs and prefix lookalikes
are denied. Domains are explicit configuration, not inferred from prompts.

A future resource adapter must map each registered ID to its canonical target
and enforce the actual target's classification before use. For filesystem
resources this includes traversal, symlink/junction, case-alias, and race checks;
for application routes it includes server-side resolution. Prefix matching or
UI hiding is insufficient. No real filesystem containment is claimed here.

The protected class is denied in all modes in this draft. Examples include
credentials, production mutation surfaces, constitutional changes, and authority
configuration. Any future exception needs its own governed process; changing
mode never opens these paths. Test/debug operations are simulated capabilities,
not executable tools in the current runtime.

## Evolution beyond the starter roles

The user confirmed that no final role/domain/path catalog exists and welcomes
a more robust approach. Treat these role names as examples, not a permanent
hierarchy. Use roles as bundles of explicit entitlements; make each decision
against verified attributes and a narrowly scoped capability grant.

Recommended target structure:

- Principal attributes: identity, organization, role assignments, domain
  memberships, and clearance state from an external trusted identity source.
- Resource attributes: stable ID, owner, domain, classification, environment,
  and allowed operations maintained in a versioned resource catalog.
- Request attributes: operation, purpose, explicitly selected access mode,
  audience, and the exact candidate/resource version.
- Grant constraints: subject, scope, trusted issuer mandate, validity period,
  revocation, and any required human approval.
- Separate decision and enforcement components: a pure policy evaluator
  explains the decision; a resource/output adapter revalidates and enforces
  it at use time. Neither UI mode labels nor model output can supply trust.

Avoid a numeric privilege ladder in which Architect implicitly inherits all
Governance access. Use separate entitlements for reading, testing, reviewing,
proposing edits, publishing, and administering access. Resource owners can
grant a narrow exception through a reviewed process without widening a role
for everyone. Explicit denials should take precedence, unknown attributes
should deny, and mode/domain changes should trigger fresh clearance checks.

Purpose/environment checks, organization isolation, denial rules, and policy
digest binding are now implemented in the draft schema-validated wrapper;
see `docs/SCOPED_POLICY_BOUNDARY.md`. The test adapter now verifies signed
snapshots and review records; per-grant issuer authentication and an operational
key service remain future work. Validate trust adapters before real use. A dedicated
policy engine may become useful later; no vendor choice is needed to keep
the contracts and enforcement boundaries independent now.

## Clearance lifetime and audit rules

Each grant binds an ID, subject, role, issuer, domain, allowed modes, exact
resources, operations, issue time, expiry, and revocation state. A trusted
registry supplies principals, role/domain assignments, issuer mandates, and
current grants. Expired, not-yet-valid, revoked, self-issued, or out-of-scope
grants cannot satisfy a check. A role assignment alone is insufficient.

Production integration must revalidate clearance at access/release time, log
the actor and decision, and prevent revocation races with use. The in-memory
simulation cannot establish durable revocation or authorize external actions.

## Release-review binding

The review subject hashes the full candidate (including text, provenance,
evidence, and manifest), access mode, domain, resource, audience, requester,
producer, and policy version. Object keys are sorted for deterministic hashing;
array order remains significant. Any changed value invalidates old approvals.

An eligible reviewer needs the required role, same domain, and a current
review_release clearance for this mode/resource. Reviewers cannot be the
requester or producer. Governance and Architect require distinct people for
the two roles even if one person holds both. Approval must attest to verified
evidence, cleared authority claims, and passing output checks. Pending,
unverified, expired, revoked, and incomplete reviews do not satisfy the design.
A matching rejection blocks completion; stale approvals cannot promote a
changed subject. These are simulated attestations, not evidence verification.

Proposed progression:

1. Validate the candidate against its independently captured invocation.
2. Register the immutable review subject and scoped audience.
3. Collect independent reviews under current clearances.
4. Revalidate the candidate, clearances, evidence, and final output checks.
5. Only a separately implemented output-release controller may issue a
   narrowly scoped release artifact and record delivery.

The current implementation simulates review completeness only. It does not
perform steps 4–5 or authenticate review records. `review_complete: true`
always accompanies `release_authorized: false`. Candidate review fields remain
PENDING; external review records do not mutate the candidate. A policy review
cannot bypass an output-gate refusal or authorize real-world execution.

## Implementation and evidence boundary

`scripts/review-policy/policy.ts` contains the draft matrix.
`scripts/review-policy/simulate.ts` evaluates hypothetical access and review
records. Both are disconnected from runtime authorization and the HTTP API.
`diagnostics/mode-review-policy.ts` exercises missing grants, Default restrictions,
mode switching, domain mismatch, protected resources, expiry, revocation, issuer
mandates, exact resource matching, independent reviews, subject changes, and
pending/failed reviews. All returned authority flags remain false.

This draft is intentionally not part of the governance manifest or canonical
mode registry. No constitutional amendment is applied. Enabling internal scope
restrictions can preserve current authority boundaries; having SkillSpring
authenticate identities, grant access to restricted external systems, or let
modes escalate authority conflicts with current constitutional text and would
require the formal amendment process before activation.

The schema-validated wrapper and external snapshot-verifier interface are now
documented in `docs/SCOPED_POLICY_BOUNDARY.md`. The test-only signed
snapshot/review-record verifier is implemented in `docs/SIGNED_POLICY_VERIFIER.md`.
The actual catalog, durable trust state, complete authenticated review history,
and operational integration remain open; access and answer release remain disabled.
