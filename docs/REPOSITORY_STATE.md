# Repository state and publication conventions

## Development and support

`main` is the GitHub default branch and maintained integration line. New slices
use short-lived `codex/` branches from current `main`, with focused commits and
preflight checks before integration. Security fixes land on `main`; checkpoint
users update to current `main`. No separate supported release line exists.

Checkpoint tags identify immutable reviewed snapshots. They do not mean a
deployment, operational authority activation, or a promise to backport fixes.
Follow-up fixes receive new commits and, when useful, a new checkpoint tag.
Existing published tags remain unchanged.

## September 2026 reconciliation

The April baseline was `458f5a4`. The reviewed checkpoint consists of `de45418`
and `ddcdb70`, published on `codex/slice-1-repository-truth` under
`checkpoint-2026-09-05-governance-candidates-signed-policy` at `ddcdb70`.
Those two commits contain many accumulated slices; their count does not express
the size or maturity of the implementation.

The checkpoint branch had become GitHub's default while `main` remained at the
April baseline. Reconciliation fast-forwards `main` through those commits,
adds the repository/support clarification, and restores `main` as default.
The original branch and checkpoint tag remain available as historical references.
No implementation history is rewritten or checkpoint tag moved.

The README and current-state document describe implemented behavior. The tag
identifies the frozen checkpoint; current `main` can include later corrections
and documentation. Consult commit history for the difference.
