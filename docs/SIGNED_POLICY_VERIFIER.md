# Signed policy verifier — review checkpoint

This slice implements an offline trust adapter under `scripts/review-policy/`.
It verifies signatures on policy snapshots and individual review records before
passing them into the scoped policy simulation. It does not activate access,
identity authentication, filesystem operations, or generated-answer release.

## Signed contract

`schemas/review-policy/signed-artifact.draft.v1.schema.json` specifies an exact
envelope: version, Ed25519 algorithm, artifact kind, trusted key ID, organization,
artifact ID, positive revision, validity interval, payload, and base64 signature.
Snapshot and review payloads undergo their existing strict schema validation.

Signatures cover a fixed domain separator and the SHA-256 canonical unsigned
envelope digest. Therefore organization, kind, key ID, revision, validity, and
payload are all bound. The verifier accepts only Ed25519 public keys pinned in
its externally supplied trusted-key registry; unknown algorithms, key IDs, or
wrong-purpose signers are rejected. Public keys are never taken from envelopes.
This is a local protocol, not a standard JWT/JWS interoperability claim.

Review keys bind a trusted principal ID. A signed review must name that same
reviewer and match the expected review-subject hash. A valid signature does not
prove that evidence was inspected: current role/domain/clearance eligibility
and all review-completeness checks still run separately. Snapshot-signing keys
represent explicitly trusted organizational policy publishers.

## Validity, rotation, and revocation

Envelopes and keys must be valid at the supplied trusted current time, with the
artifact's lifetime inside the key's window. Review/snapshot payload timestamps
must agree with their envelopes. Future and expired artifacts are rejected.
Accepted verification time cannot move backward within one verifier instance.

Key rotation uses separately pinned old and replacement key IDs. Both may be
valid during an overlap; newer signed revisions continue the same stream.
Revoking the old key denies its artifacts without invalidating artifacts signed
by the replacement key. The local `revokeKey` and `revokeArtifact` methods are
trusted management inputs, not public endpoints or model-callable operations.

Snapshot revisions are tracked per organization, regardless of snapshot ID.
Review revisions are tracked per stable review-record ID. Lower revisions fail;
the same revision with different signed content fails. Exact same-content
revalidation is idempotent, not a one-use authorization. Invalid signatures or
payloads cannot advance the revision high-water mark. State changes are
synchronous within this single local JavaScript instance.

## Use through signed wrappers

`signed-boundary.ts` re-verifies snapshot and review signatures/revocation for
each simulated check. Verified snapshot data and a digest-bound receipt feed
the scoped boundary; individual verified review records feed review checks.
Failed records reject the batch. No partial successful review is returned.
The verifier can nevertheless retain newer validated revisions seen before a
later batch failure, so a failed batch does not roll back trusted observations.

All scoped results retain `SIMULATION_ONLY` and `access_authorized: false` or
`release_authorized: false`. The underlying low-level receipt APIs are still
available for tests; their structural receipts are not capabilities and must
not be accepted from untrusted callers or cached for operational use.

## Material limitations for review

- Revision history, revocations, and observed time are memory-only. Restarting
  or constructing a new verifier resets them. This is not durable anti-rollback.
- Key enrollment/rotation is supplied as trusted configuration; there is no
  remote key service, certificate chain, key discovery, or authenticated admin API.
- Review signatures cannot prove that a caller supplied the complete review
  history. A caller could omit an independently stored rejection or invent new
  record IDs. A trusted append-only review store and stable identity rules must
  establish completeness before operational review is possible.
- Multi-process coordination, atomic revalidation at use time, durable revocation,
  crash recovery, and protection from compromised local code remain absent.
- The test review subject is not by itself proof of candidate validity, evidence
  truth, or final output admissibility. Those remain separate release gates.

## Verified evidence

`npm run preflight` includes `signed-policy-verifier`, exercising signature
tampering, wrong keys, wrong organizations and purposes, reviewer impersonation,
invalid/missing payloads, future/expired keys and artifacts, key/artifact revocation,
overlapping replacement keys, revision rollback/conflict, rejection superseding
approval, and prevention of invalid high-revision poisoning. Existing scoped
checks verify the resulting hypothetical access and review decisions.

Keys are generated ephemerally in diagnostics, never stored or printed. No
live AWS calls or production signing keys are used. This draft is not added
to the active governance manifest, and no constitutional changes are applied.

User review of this checkpoint is complete; see `docs/REVIEW_HANDOFF.md`.
Operational integration remains deferred. No subsequent slice is started.
