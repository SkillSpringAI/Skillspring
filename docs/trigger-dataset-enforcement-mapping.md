# SkillSpring Trigger–Dataset–Enforcement Mapping

**Status:** Canonical Reference  
**Scope:** Core Triggers (Phase 1)  
**Authority:** Informational mapping only. Enforcement is governed by constitutional rules and schemas.

---

## Purpose

This document defines the explicit mapping between:
- registered triggers
- supporting datasets
- mandatory enforcement outcomes

Its purpose is to ensure deterministic, auditable enforcement behavior and to prevent ambiguity in trigger handling.

Triggers do not act alone. They are interpreted in conjunction with datasets and enforced via constitutional rules.

---

## Mapping Table

| Trigger ID | Trigger Name                     | Supporting Dataset(s)                               | Enforcement Outcome                        |
|----------:|----------------------------------|-----------------------------------------------------|--------------------------------------------|
| T-1       | Domain Sensitivity Detection     | regulatory/ai-regimes.json                          | Control Plane escalation, evidence raised  |
| T-2       | Jurisdiction Ambiguity           | regulatory/ai-regimes.json                          | Clarification request or fail-closed       |
| T-3       | Rights Impact Signal             | regulatory/ai-regimes.json                          | Strict mode, block actionable guidance     |
| T-4       | Authority Escalation Attempt     | evaluation/test-prompts.json                        | Immediate refusal, execution halt          |
| T-5       | Dual-Use Risk                    | risk-patterns/dual-use-patterns.json                | High-level abstraction only                |
| T-6       | Coercion or Manipulation Signal  | evaluation/test-prompts.json                        | Boundary response or refusal               |
| T-7       | Evidence Deficiency              | evaluation/test-prompts.json                        | Uncertainty labeling, restricted claims    |
| T-8       | Reconstruction Risk              | risk-patterns/reconstruction-vectors.json           | Categorical refusal, halt execution        |

---

## Enforcement Notes

- Multiple triggers may activate simultaneously.
- When triggers conflict, the **most restrictive enforcement outcome prevails**.
- Reconstruction risk (T-8) always supersedes dual-use handling.
- Authority escalation (T-4) and reconstruction risk (T-8) require immediate halt behavior.

---

## Non-Authority Clause

This mapping:
- does not grant authority
- does not override schemas
- does not modify enforcement logic

It exists to improve transparency, auditability, and implementation clarity.

---

## Change Control

This document is versioned but non-constitutional.

Changes require:
- clear rationale
- alignment with trigger registry and datasets
- explicit commit history

Constitutional amendments are not required unless enforcement semantics change.

---

**End of Mapping**
