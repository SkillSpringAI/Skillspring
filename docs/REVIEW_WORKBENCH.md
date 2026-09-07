# Local candidate-review workbench

Run from the repository root using Node 24:

```powershell
npm run workbench
```

Open http://127.0.0.1:8788. The evaluation API remains a separate command and
port. Stop the workbench with Ctrl+C. The workbench uses the existing npm
dependencies and makes no provider calls.

## Review a draft

1. Select Default, Governance, or Architect. Each mode has an independent
   synthetic candidate, audience binding, and review history.
2. Inspect the draft and each claim's bound source excerpt. Expand the source
   and provenance section to inspect the full source, capture time, hashes,
   scope, and manifest. Offsets count Unicode code points, with exclusive ends.
3. Select a test reviewer. Record Supported, Not supported, or Uncertain for
   each claim; then record authority and output findings. New assessments start
   uncertain. Existing reviewers load their latest saved assessment.
4. Save the test assessment. It is signed on the server with an ephemeral test
   key, submitted to the durable candidate-review boundary, and rechecked.
   Selecting Record findings can store an uncertain assessment; it only
   qualifies positively when all claims are supported and both checks pass.
5. Repeat for the remaining required reviewers. Default requires a domain
   reviewer; Governance requires a domain reviewer and governance officer;
   Architect requires an engineering maintainer and governance officer.

The status panel shows the actual boundary result and its reason code. Complete
means only that the synthetic review requirements were met. The candidate's
UNVERIFIED/PENDING fields and release_authorized:false remain unchanged.

Reject this draft records a permanent rejection for that exact subject in this
session. Refreshing, changing modes and returning, or recording later positive
findings cannot clear it. There is no rejection-clear button.

## Trust and lifetime

This is a local research working surface over synthetic material. The test
reviewer selector is not authentication. Server-generated signatures are not
attestations from enrolled humans. It accepts no uploaded candidate, arbitrary
source, key, policy, clearance, or external signature. A real review workflow
requires separately designed identity, evidence capture, and artifact retention.

The fixture clock is fixed at 2026-09-06T00:00:00Z and displayed in the interface.
This intentionally avoids fixture expiration during an interactive session; it
does not model elapsed wall-clock time or operational freshness. Each launch
creates private temporary SQLite stores and ephemeral signers. Reviews survive
page refresh and mode changes until the server stops. Normal shutdown closes
and removes these stores. An abrupt process kill can leave temporary synthetic
databases under the operating system's temp directory; keys are not saved, and
those databases are never silently reopened. Restarting is a new simulation,
not a rejection-resolution mechanism or a restart-safe reviewer service.

Multiple browser tabs share this local session. A submission includes its exact
subject hash and the reviewer's expected revision. Stale writes return 409.
After an error, refresh before trying another write: a lost response may follow
a successful commit. Refresh replaces unsaved selections. The process handles
revision comparison and submission synchronously against its private store;
this does not establish cross-process optimistic concurrency for a future service.

## Local HTTP boundary

The workbench listens only on 127.0.0.1, default port 8788. It serves an explicit
asset allowlist, GET /api/workbench?mode=DEFAULT (also GOVERNANCE and ARCHITECT),
and POST /api/reviews. It has no routes for execution or release.

The server and entry point live in scripts/review-policy, alongside the other
non-operative simulations. The existing runtime/src forbidden-import rules
remain unchanged; an additional tripwire rejects core imports of review-policy.
Browser assets in src/workbench contain only presentation code.

Requests require the exact loopback Host. Cross-origin and cross-site requests
are rejected. Writes additionally require the exact same Origin and a random
per-process X-Workbench-Token obtained through the same-origin state endpoint.
This token prevents cross-site browser writes; it is not local-user authentication.
Trusted local clients can read the synthetic session and token.

The POST contract rejects extra fields and binds the submitted reviewer, claim
set, subject hash, and revision. The server derives package hashes, signing
identity, role, and record flags; callers cannot supply those authority inputs.
JSON bodies are capped at 16 KiB and headers at 8 KiB, with two-second transport
deadlines and strict UTF-8 decoding. Responses use no-store, same-origin resource
policy, and a CSP forbidding embedding, inline code, and remote assets. Draft and
source text is rendered with textContent, never inserted as HTML.

## Verification and remaining work

The workbench diagnostic exercises all three modes via HTTP, strict request
validation, source/claim presentation data, uncertain-to-complete progression,
distinct reviewer requirements, stale revisions, rejection persistence, and
false release flags. It also checks transport origin/host/token boundaries,
body limits, asset serving, and the separation from the public evaluation API.
The build checks browser JavaScript syntax. Existing candidate and durable-store
diagnostics continue checking signatures, expiry, tampering, restarts, and races.

This slice adds the 39th diagnostic step. Browser interaction and visual QA are
not automated or claimed by these tests. The layout includes responsive columns,
visible focus states, native labeled controls, and live status/error messages;
manual browser review remains part of slice acceptance.

Follow-up work includes curated candidate import and retention, externally
enrolled reviewers, real observation time, and governed rejection resolution.
Those require explicit contracts before this synthetic adapter can be replaced.
