# Candidate evidence and signed review — slice 3

This slice connects candidate validation, source receipts, scoped access checks,
and durable signed review history. The result is review completeness for a
bounded informational draft. Actual access and answer release remain disabled.

## Supported scope

The initial requirements version is `sourced-informational-review-v1`. A package
contains one valid generated-answer candidate, 1–16 source artifacts, and 1–64
claims. Every non-whitespace Unicode code point in the answer must belong to
exactly one claim span. Every claim needs at least one source excerpt, and every
supplied source must be used. This deliberately excludes unsourced/model-only
drafts, free-form creative work, and mixed sourced/unsourced answers from this
particular review path. The original candidate contract still permits drafts
without sources; those cannot satisfy this stronger package contract.

Offsets are half-open Unicode code-point ranges, not UTF-16 indices or byte
offsets. Source text is limited to 32,768 code points per artifact. Text hashes
use the exact UTF-8 representation, as in the original candidate contract.

## Trusted context and package binding

`prepareCandidateReview` builds an internal artifact from a candidate, trusted
`CandidateReviewContext`, scope, source artifacts, claim ranges, and current time.
It copies the supplied values. It does not retrieve sources, authenticate users,
or grant permission to display the resulting internal artifact.

The trusted context contains the original candidate context plus source receipts
from an independent capture controller. Each evidence receipt binds a source ID,
content hash, registered resource, organization, domain, origin, and capture time.
Those values must never be taken on authority from model-generated text.

The package is embedded in the review subject and includes the exact candidate,
source text and receipts, claim/excerpt ranges, requirements version, and a digest
of the trusted context's JSON representation. The outer subject binds mode,
domain, organization, resource, audience, requester, producer, purpose/environment,
policy version, and policy digest. Any change requires a newly bound review.

Candidate and source ID/hash sets must match exactly in this path. Duplicate
IDs, altered bytes or resource labels, unknown source references, empty/overlapping
spans, uncovered answer text, and unused sources fail. Capture and completion
times cannot be in the future. The existing output gate is used as a supplemental
legacy probe; the substituted SAFE_STUB is never returned. Passing that probe is
not final generated-answer admissibility or comprehensive semantic screening.

All times in this candidate-review path are Unix milliseconds. New stores and
signer validity windows must use that time basis. Earlier toy-time fixtures are
not silently reinterpreted.

## What a signed assessment means

The draft review record now permits an optional `candidateAssessment` field.
It remains optional for historical simulation records; an old record cannot
satisfy the new candidate-review gate without it. The existing Ed25519 signature
covers the complete record, including this assessment and the subject hash.

A qualifying assessment binds the package and answer hashes and must:

- cover every claim ID exactly once with a SUPPORTED finding;
- declare review coverage COMPLETE;
- declare authority claims CLEARED and output admissibility PASS;
- agree with the existing review record's positive evidence/authority/output flags;
- have a review time at or after candidate completion and source capture.

These are reviewer attestations. A reviewer is responsible for inspecting the
entire answer, deciding whether the cited excerpts actually support each claim,
considering missing context and source reliability, and identifying impermissible
authority claims or output. The software checks bindings, coverage, and declared
findings. It cannot prove factual truth, entailment, or that a human performed
the inspection. Signer identity and enrollment remain externally trusted inputs.

Incomplete and uncertain assessments can be stored so they replace an earlier
revision, but cannot qualify as positive reviews. An explicit signed REJECT
remains a permanent subject-level blocker in the current store, even without a
positive assessment. Omission, later approval, expiry, revocation, or a new ID
cannot clear that rejection. Rejection resolution is still unimplemented.

## Durable checks and mode-aware clearance

`acceptCandidateReview` validates the package and assessment binding before
submitting the signed record to durable history. Generic low-level ingestion
remains available for compatibility; it cannot bypass the stronger check.

`checkCandidateReview` revalidates the candidate/context and reads stored reviews.
Snapshot observation, current signed review verification, evidence clearance,
reviewer qualification, and commit occur within the store transaction. An SQL
write failure denies the result even if the hypothetical checks passed.

Every recipient needs current read clearance for the answer resource and every
evidence resource. Each qualifying reviewer needs current read clearance for
the answer and evidence, plus the existing review-release clearance. Explicit
denials, protected resources, wrong domains/purposes/environments, expired or
revoked grants, and removed signer keys cannot be bypassed by an assessment.

Default requires one domain reviewer. Governance requires distinct domain-reviewer
and governance-officer principals. Architect requires distinct engineering-maintainer
and governance-officer principals. The independent Architect governance reviewer
uses explicit review-role read clearance; this does not grant an Architect
workspace or permit unrelated engineering operations. Self-review remains excluded.

The generic durable `checkReview` refuses candidate-package subjects with
USE_CANDIDATE_REVIEW_BOUNDARY, avoiding accidental use of the weaker generic
check. Legacy low-level helpers are still simulations, not release capabilities.

Successful candidate checks return CANDIDATE_REVIEW_COMPLETE_NOT_RELEASE_AUTHORITY,
with `release_authorized: false`. Reports contain no answer or source text. The
candidate's own evidence remains UNVERIFIED and both review fields remain PENDING;
external signed records do not mutate that contract. The public evaluation API
continues returning SAFE_STUB or refusal.

## Compatibility and provenance

The optional assessment field is an additive draft-record change. Existing
stored records still replay under the new reader; old software may reject new
assessment-bearing records and must not be used to downgrade such a store.
SQLite format and fixed trust enrollment are unchanged. No private keys or raw
candidate/source contents are written by review ingestion: history stores the
signed assessments and digest bindings. Internal packages must be retained and
protected separately by a future artifact store if review needs to be resumed.

These draft schemas remain outside the active governance manifest. No canonical
candidate schema, constitutional rule, public output contract, or release
permission changes. The existing runtime manifest and historical Bedrock reports
remain unchanged. Requirements changes must receive a new version and fresh
reviews; signatures are not a substitute for reviewing verifier code changes.

## Exercise the complete synthetic flow

```powershell
npm run preflight
npm run demo:candidate-review
```

The demo uses synthetic sources and ephemeral test signers for all three modes.
It reports pending review, complete fixture assessments, and a stored rejection
after restart. It explicitly reports that no human review or provider call
occurred. Temporary databases are removed and private keys are never printed.
The existing Bedrock candidate test has no evidence retrieval and cannot complete
this sourced-review path on its own.

Preflight now has 38 diagnostic steps. The new step covers all three modes,
tampering, Unicode spans, missing coverage/receipts, legacy and unsigned assessments,
uncertainty, self-review, source/answer clearance, changed bindings, persistent
rejections, review expiry/signer revocation, and commit failure. Earlier crash/concurrency
tests continue to exercise the underlying durable store.

## Next decision

Before a real review workflow, define the curated source catalog, evidence-capture
and artifact-retention boundaries, and external reviewer identity/signing service.
Then design an explicit rejection-resolution and final release protocol. Neither
connecting Bedrock nor obtaining positive fixture reviews authorizes that transition.
