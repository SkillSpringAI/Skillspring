# Durable policy history — simulation slice

`scripts/review-policy/history-store.ts` defines a synchronous transactional
storage contract and a local SQLite adapter. `durable-boundary.ts` provides
simulation checks using that store. Neither module is wired into the runtime
API, a real resource adapter, or an answer-release controller.

## Storage and trust contract

A store belongs to one organization and one digest-bound set of pinned public
keys. Creation is explicit and refuses an existing file. Opening requires an
existing database with matching organization, format, and trust configuration;
missing history is never automatically replaced with an empty database.

The key set is fixed for this storage format. Rotation can use replacement keys
pinned at creation, including overlapping validity windows. Adding keys or
changing enrolled key material requires a future explicit migration design.
Private keys are never required by the store. The diagnostics generate them
ephemerally to sign synthetic fixtures.

The adapter uses Node 24's built-in experimental SQLite module, with no new npm
dependency. SQLite uses full synchronous writes and a rollback journal.
`BEGIN IMMEDIATE` serializes writers and simulation checks across connections
and processes. Lock contention fails closed without automatic retry.

Each accepted signed artifact or trusted revocation command produces an
append-only event containing the trusted observation time. A sequence and
hash chain bind event content to a metadata tail. Update/delete triggers protect
events through the ordinary SQL interface. Events and the tail commit in the
same transaction; a write failure or crash before commit cannot leave an
acknowledged partial observation. Results are returned only after commit.

Before every operation, the wrapper rebuilds the verifier from the complete
stored event sequence under the transaction lock. It rechecks signatures and
payloads at their recorded acceptance times, then applies current expiry,
revocation, revision, and clock checks. There is no cached mutable verifier to
carry a failed transaction's state into the next operation. Lower revisions,
same-revision conflicts, and accepted-time rollback remain rejected after restart.

Repeating the same event at the same time is idempotent. A later successful
revalidation records its later observation time. The initial adapter has a
10,000-event write limit and replays history on each operation; it is a bounded
research implementation, not a high-throughput production service.

## Review completeness and rejection handling

`DurablePolicySimulation.acceptReview` ingests a signed review bound to a subject
hash. Stable identity is enforced in both directions: one review ID per
organization/reviewer/subject, and one reviewer/subject owner per review ID.
Key replacement for the same principal can continue the existing record stream.
It cannot invent a new record ID to hide earlier decisions.

`checkReview(subject, snapshot, now)` has no records-list argument. It reads the
latest accepted revisions for that subject from the store and revalidates current
approval eligibility, including recipient access, against the signed snapshot.
The transaction also prevents a concurrent local revocation from changing the
history halfway through that check. This is not revalidation at a real resource.

Any accepted signed REJECT permanently blocks that exact subject in this slice.
Expiry, revocation, a later APPROVE, or a new record ID cannot clear it. There is
no rejection-resolution operation. Such an operation needs a separate governed
design and an explicit append-only resolution record. Changed candidate,
audience, or policy bindings form a different subject and require fresh reviews;
they do not inherit approvals or clear the old subject's history.

Accepted history is complete only relative to this store's ingestion boundary.
It cannot detect a review never submitted to it or prove external system history
complete. Malformed or invalid artifacts are rejected without appending an
accepted event. This is not a complete security audit log of attempted requests.

## Failure and authority boundaries

- Missing, closed, replaced, corrupt, locked, or unwritable stores cannot produce
  a positive simulated access/review result. No in-memory fallback exists.
- The hash chain and metadata detect inconsistent edits and truncation, not a
  malicious host rewriting the entire database or restoring a consistent older
  backup. Stronger rollback protection requires an independently trusted external
  checkpoint or monotonic history service.
- The filesystem, clock, pinned keys, and revocation caller remain trusted inputs.
  There is no identity provider, remote administration, or operational grant issuance.
- Candidates are still unverified drafts. This slice does not establish evidence
  truth, constitutional amendment approval, or final output admissibility.
- Actual access/release flags remain false, including after hypothetical success.
  The older in-memory and caller-list wrappers remain isolated test helpers;
  use the durable wrapper when exercising persisted review history.

## Validation

The added diagnostic tests restart after key/artifact revocation, snapshot
rollback and clock rollback, idempotence, invalid higher-revision poisoning,
stored rejection omission, expiry, approval supersession, record-owner conflicts,
new-ID substitution, and changed candidate/audience/policy subjects.

Failure tests inject an SQL failure after event insertion but before metadata
update, terminate a child process before commit, corrupt/truncate stored events,
and hold a competing write lock. Two independent processes race with conflicting
signed revisions; only one is accepted, and the stored winner remains authoritative
after reopening. This slice brought preflight to 37 diagnostic steps; the README
records the current count. No AWS calls are needed.

The subsequent [candidate evidence review slice](CANDIDATE_EVIDENCE_REVIEW.md)
adds a stronger package-specific gate and optional signed assessment fields.
Historical generic records continue to replay, but cannot satisfy that gate alone.
