# Registry change validation

CI checks explicit committed comparisons. Locally, staged and unstaged changes
are checked separately. Generated-content synchronization and manifest verification
remain separate checks in the same preflight.

| Invocation | Comparison |
| --- | --- |
| Local preflight or hook | Staged and unstaged diffs, validated separately |
| Existing-branch push | Event before to after commits |
| New-branch push | Merge base of fetched default branch and pushed head, to pushed head |
| Pull request | Merge base of event base/head commits, to event head |
| Manual CI dispatch | Required base input to dispatched GITHUB_SHA |
| Explicit override | REGISTRY_DIFF_BASE and REGISTRY_DIFF_HEAD, both required |

Both workflows fetch full history. Missing revisions, unavailable merge bases,
unsupported CI events, and absent CI comparison configuration fail the check.
A new branch whose head is already contained in the default branch requires a
manual run with an explicit base. Unavailable force-push history also fails;
the checker never falls back to an empty local diff in CI.

Git commands use argument arrays and resolved commit IDs. Null-delimited paths
and disabled rename detection treat renames as deletion plus addition.

To check committed changes locally in PowerShell:

```powershell
$env:REGISTRY_DIFF_BASE = 'origin/main'
$env:REGISTRY_DIFF_HEAD = 'HEAD'
npm run preflight
Remove-Item Env:REGISTRY_DIFF_BASE, Env:REGISTRY_DIFF_HEAD
```

## Change rules and limits

Existing versioned registry JSON files cannot be modified, deleted, renamed,
or changed to another Git file type. Each addition requires a changed registry
changelog, registry index, and exact generated module:

| Registry family | Generated module |
| --- | --- |
| invariants.vN.json | invariants.vN.ts |
| failure-codes.vN.json | failureCodes.vN.ts |
| decision-codes.vN.json | decisionCodes.vN.ts |

Unknown families require an explicit mapping. An unrelated generated file with
the same version cannot satisfy the check. Unstaged companions cannot satisfy
a staged addition. Untracked files enter this check when staged.

These are net endpoint comparisons, not an audit of every intermediate commit.
The check requires companion files to change; their correctness remains subject
to generated-sync, schema diagnostics, and review. It does not establish amendment
approval. Workflow and diagnostic code remain part of the trusted review surface.

## Regression coverage

The added Git-fixture diagnostic uses isolated temporary repositories to exercise
committed and staged changes, forbidden mutations/deletions/renames, missing
companions, incorrect same-version matches, unknown families, missing history,
and push/PR/manual selection. The PR fixture includes an independently advanced
base branch. No AWS calls occur. This slice brought preflight to 36 diagnostic
steps; the README records the current count after subsequent slices.
