# SkillSpring Governance

SkillSpring is a constitution-first governance runtime. Governance decisions
are made before any future execution capability and are enforced through
explicit control, authority, evidence, and output boundaries.

## Current posture

- The constitutional documents in `constitution/` define normative authority.
- The runtime currently provides a deterministic governance pipeline and an
  intentionally inert execution stub.
- Reasoning, model output, tool availability, and API authentication do not
  grant governance authority.
- Unknown, invalid, or unverifiable authority must fail closed.
- Outputs must pass the output admissibility gate before they are returned.
- Candidate validity does not authorize an answer: evidence remains unverified
  and candidate reviews remain pending.
- Draft modes narrow role/domain scope. Mode selection alone cannot grant
  clearance; Governance and Architect simulations require independent grants.
- Signed-policy tests authenticate inputs against local test trust only. They
  are not an identity service or an operational access/release authority.

The current implementation status and evidence boundary are maintained in
[`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md). This document summarizes
the repository posture and does not replace the constitution.

## Governance changes

Changes to constitutional authority require review against the amendment
protocol in `constitution/amendment-protocol.md`. Runtime changes that affect
governance must identify the applicable invariant, update diagnostics, and
review schema, registry, and provenance impact.
