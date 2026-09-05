# Contributing to SkillSpring

## Before submitting a change

Review the constitution, inspect the complete diff, and run:

```text
git diff
git status --short
npm run preflight
```

Do not add autonomous execution, unrestricted tool calling, or authority
expansion as incidental work.

## Governance-impacting changes

For changes that affect governance behavior, include:

- the constitutional invariant or policy source being changed;
- updated diagnostics for the changed behavior;
- schema updates when a contract changes;
- registry updates when identifiers or codes change;
- a version and provenance impact review;
- documentation updates that distinguish implemented behavior from plans.

Keep the deterministic governance core independent from optional AI or
integration layers. New capabilities require an explicit authority boundary,
failure semantics, and a testable reason to exist.

## Verification and generated artifacts

Preflight compiles TypeScript and runs 35 diagnostic steps, including fake
provider responses, local HTTP requests, and ephemeral signing keys. It makes
no AWS calls. Run live Bedrock commands separately only when explicitly intended;
they incur charges and their results must retain the manifest used at invocation.

After changing registry sources, run `npm run gen:registries`. After changing
manifest inputs, run `npm run gen:governance-manifest`, then
`npm run verify:governance-manifest` and the full preflight. Inspect generated
diffs. Manifest hashes use raw file bytes, so preserve constitutional file line
endings and do not rewrite historical evidence with a newer manifest ID.

Draft schemas under `schemas/review-policy/` and scripts under
`scripts/review-policy/` remain outside runtime authority and the active manifest.
Do not turn hypothetical success into actual access or answer release.

Review untracked files as well as tracked changes before staging. Check the
staged diff for unintended artifacts and credentials, and run
`git diff --cached --check` before publishing. See
[`docs/INTERNAL_ENGINEER_HANDOFF.md`](docs/INTERNAL_ENGINEER_HANDOFF.md) for
enforcement boundaries and [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) for
known limitations.
