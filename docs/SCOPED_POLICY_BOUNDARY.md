# Schema-validated policy boundary (draft)

`scripts/review-policy/boundary.ts` adds strict JSON validation and scoped
checks around the non-operative access/review simulator. Runtime authorization,
the HTTP API, and the answer candidate contract are unchanged.

## Wire contracts

Four draft JSON schemas live in `schemas/review-policy/`:

- `request.draft.v1.schema.json`: actor, mode, domain, exact resource ID,
  operation, purpose, environment, organization, and policy digest.
- `snapshot.draft.v1.schema.json`: organization-specific principals, resources,
  grants, issuer mandates, denial rules, policy digest, and snapshot validity.
- `subject.draft.v1.schema.json`: the review subject plus organization, purpose,
  environment, and policy digest. Candidate validity remains a separate check;
  this review schema only requires the candidate field to be an object.
- `records.draft.v1.schema.json`: review attestations and validity periods.

Unknown properties, missing fields, incorrect enums/types, and excessive
collection sizes fail validation. These contracts use integer epoch milliseconds
for times. The older typed simulator remains available for unit exploration;
new integration experiments should use the schema-validated boundary.

## Trusted external interface

`VerifiedSnapshotReceipt` is an out-of-band input containing snapshot ID,
canonical content digest, organization, and trusted current time. A future
external verifier must authenticate the snapshot source, validate its signature
and key chain, enforce organization binding, check revocation/version freshness,
and provide this receipt through a trusted internal channel. Neither model text
nor HTTP callers may supply it.

The test-only signed verifier is now implemented separately in
`docs/SIGNED_POLICY_VERIFIER.md`; no operational key management or identity
login is implemented. These lower-level offline tests construct receipts explicitly. Comparing a
hash to a caller-created receipt does not authenticate anyone. The boundary
checks that content matches the supplied receipt and that snapshot validity,
organization, and the current draft-policy digest match. It does not prevent
rollback to an older still-valid snapshot; that needs a trusted monotonic
revision/revocation source and revalidation at use time.

`policyDigest` hashes the draft role/mode policy matrix, not the entire runtime
or all schemas. The main governance manifest is unchanged because these remain
non-operative draft contracts, not active authority.

## Scope and deny precedence

Resources have an explicit environment. Grants enumerate exact allowed purposes
and environments in addition to their existing role/domain/mode/resource/operation
scope. Grant matching has no wildcard expansion. One snapshot belongs to one
organization; cross-organization requests are denied.

Denial rules are conjunctive across actor, domain, resource, mode, operation,
purpose, and environment. Within each dimension, the listed values are ORed.
`*` is supported only in string dimensions of denial rules and means all values
in that dimension. An applicable denial wins over any grant. An empty denial
list does not grant access; normal grants and all mode restrictions still apply.
These rules are active for the snapshot's validity period and change by issuing
a new snapshot, not by silently editing a live record.

## Review consequences

Every audience member must independently pass scoped read checks. A reviewer
under an applicable review_release denial cannot satisfy approval requirements.
Existing matching rejection records remain blocking even when a reviewer's
grant is removed. Organization, purpose, environment, and policy digest are part
of the subject hash; changing them invalidates prior approvals.

Review records are not authenticated by this module. The future trusted review
store must validate signatures, reviewer identity, revocation, subject binding,
and durable history before these checks can support operational review. Candidate
validation, evidence verification, final output admissibility, and release
authority remain separate unsatisfied gates.

Every result still says `SIMULATION_ONLY`, with `access_authorized: false` or
`release_authorized: false`, including positive hypothetical checks. No file
access, tool execution, permission issuance, answer release, or AWS call occurs.

## Verification and next slice

`npm run preflight` covers the boundary with malformed input, unknown fields,
wrong organization/environment/purpose/policy, snapshot tampering and expiry,
duplicate identifiers, explicit-denial precedence, denied recipients/reviewers,
and invalidated review bindings. Existing tests continue covering mode/role
containment and clearance lifetime.

The signed snapshot/review-record verifier and local rotation, revocation,
and in-memory rollback tests are implemented. User review is complete;
see `docs/REVIEW_HANDOFF.md`. Operational activation still requires durable
trust state and review against constitutional authority boundaries.
