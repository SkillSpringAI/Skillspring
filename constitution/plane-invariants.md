SkillSpring Plane Invariants

Status: Canonical
Change Control: Amendment-only via amendment-protocol.md
Scope: Control Plane, Execution Plane, Output Plane
Precedence: Subordinate only to Immutable Laws, Authority Boundaries, and Global Axioms

Purpose

Plane Invariants define the non-negotiable rules governing how authority, logic, and outputs are separated and constrained within SkillSpring.

They prevent:

leakage of power between layers

hidden coupling

emergent authority

enforcement bypass via architecture

Each plane has a single responsibility and a hard boundary.

Overview of Planes

SkillSpring operates across three primary planes:

Control Plane – classification, jurisdiction, authority resolution

Execution Plane – reasoning, analysis, transformation

Output Plane – admissibility, redaction, final delivery

No plane may assume the responsibilities of another.

CP-1 — Control Plane Supremacy

All execution must be gated by the Control Plane.

The Control Plane:

classifies domain and jurisdiction

resolves applicable laws and constraints

selects execution mode

establishes authority limits

If Control Plane resolution fails or is uncertain, execution must not proceed.

CP-2 — Control Plane Non-Execution

The Control Plane shall not:

perform reasoning

generate content

optimize outcomes

transform user inputs beyond normalization

Its role is authorization, not intelligence.

EP-1 — Execution Plane Subordination

The Execution Plane operates only within the bounds established by the Control Plane.

It may:

reason

analyze

transform

structure information

It may not:

expand authority

reinterpret constraints

bypass enforcement

emit final outputs

EP-2 — Execution Plane Non-Admissibility

The Execution Plane may generate intermediate artifacts, but none are user-visible by default.

All execution artifacts must pass through Output Plane gating before exposure.

OP-1 — Output Plane Exclusivity

Only the Output Plane may emit user-visible outputs.

The Output Plane is responsible for:

admissibility checks

evidence labeling

redaction and refusal

final formatting

No other plane may directly communicate with the user.

OP-2 — Output Plane Final Authority

If the Output Plane rejects an artifact:

the artifact is invalid

the rejection is final

no retry or reformulation may bypass it

Rejection overrides execution success.

Cross-Plane Invariants
CPI-1 — No Upward Authority Flow

Lower planes may not modify or reinterpret constraints imposed by higher planes.

Authority flows downward only.

CPI-2 — Explicit Interfaces Only

Planes may interact only through:

declared schemas

validated interfaces

auditable handoffs

Implicit coupling is prohibited.

CPI-3 — Fail-Closed Semantics

If any plane fails, degrades, or becomes uncertain:

downstream planes must not proceed

outputs must default to refusal or safe degradation

Partial success is not acceptable.

Relationship to Other Governance Layers

Immutable Laws define what must never be violated

Authority Boundaries define where power stops

Global Axioms define how conflicts resolve

Plane Invariants define how the system is allowed to operate

All four layers are jointly required.

Versioning

This document is version-locked.

Revisions require:

formal amendment proposal

impact analysis

explicit version increment

archival of superseded versions

See amendment-protocol.md.

End of Plane Invariants