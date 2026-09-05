# SkillSpring internal engineer handoff

This guide describes the reviewed research checkpoint. Read
[current state](CURRENT_STATE.md) and [review handoff](REVIEW_HANDOFF.md) before
extending the system. The constitution remains the normative source; this
document does not amend it or grant authority.

## Authority and enforcement

`constitution/` defines governing rules. Schemas and registries express contracts
and identifiers. Enforcement spans `runtime/pipeline.ts`, policy assembly,
control/authority checks, evidence handling, and `runtime/outputGate.ts`;
it is not confined to the control-plane directory. The
[implementation map](CONSTITUTION_IMPLEMENTATION_MAP.md) distinguishes implemented
checks from gaps. Passing diagnostics is not proof of complete enforcement.

The public CLI and evaluation API use the governed pipeline. The HTTP wrapper
validates transport and request shape; it does not accept caller-supplied
authority or diagnostic metadata. Unknown, invalid, or unverifiable authority
must fail closed. Formatting and transport code must not override an output refusal.

The execution plane remains inert. Lifecycle, journal, replay, and authority
contracts do not constitute a real executor or durable audit system. Do not
add tools, external side effects, or authority expansion as incidental work.

## Experimental integrations

`scripts/bedrock/` provides explicit opt-in provider diagnostics using fixed
prompts. These commands are separate from the public API and return diagnostic
reports, not authorized generated answers. Provider output is untrusted input.
Candidates bind content to invocation provenance, but valid structure and
matching hashes do not verify evidence or satisfy pending reviews.

`scripts/review-policy/` and its draft schemas simulate scoped access and review.
Modes narrow independently granted scope; model classification cannot create
clearance. Signed inputs are checked against pinned test trust. Revision and
revocation history live only in memory, and a complete authenticated review
store is absent. Hypothetical success must retain false actual-authority flags.

Datasets inform decisions but do not grant permission or override the constitution.
Likewise, a signature authenticates a statement against configured trust; it does
not prove that statement true or authorize a resource operation.

## Changes and verification

Changes to constitutional authority follow the
[amendment protocol](../constitution/amendment-protocol.md). For governance
implementation changes, identify the applicable invariant, update behavioral
diagnostics, and review contract, registry, and provenance impact. Experimental
schemas do not become operative authority simply by being added to the repository.

Follow [contributing](../CONTRIBUTING.md) for regeneration and review steps.
Run `npm run preflight`: TypeScript compilation and 35 offline diagnostic steps.
Fix failures at their source rather than weakening checks. Preserve historical
live reports under their original manifest IDs and never commit credentials.

Operational identity integration, durable trust state, real resource enforcement,
and generated-answer release require further design and review. They are not
enabled by this checkpoint.
