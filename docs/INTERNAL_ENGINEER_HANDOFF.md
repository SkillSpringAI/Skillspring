# SkillSpring Internal Engineer Handoff

**Audience:** Internal engineers, licensed partners, authorized integrators  
**Status:** Binding guidance  
**Warning:** This system is governance-first. Capability comes second.

---

## Read This First

SkillSpring is not a typical AI system.

If you attempt to:
- “make it smarter”
- “speed it up”
- “skip a step”
- “just get something working”

you are likely violating core invariants.

This document exists to prevent that.

---

## Core Rule

**No execution, reasoning, or output is permitted outside the governed pipeline.**

There are no shortcuts.
There are no exceptions.
There are no hidden entry points.

---

## Where Authority Lives

Authority is defined **only** in:

- `constitution/`
- `schemas/`
- `runtime/control-plane/`

If you are modifying logic outside these areas and affecting behavior, stop.

You are probably doing something wrong.

---

## Control Plane Is Sacred

The Control Plane:
- decides if execution is allowed
- resolves jurisdiction
- enforces authority boundaries
- selects execution mode

If the Control Plane:
- cannot decide
- lacks information
- encounters ambiguity

**Execution must not proceed.**

Fail closed.

---

## Execution Plane Rules

The Execution Plane:
- may reason
- may analyze
- may transform information

It may **never**:
- expand authority
- infer permission
- bypass enforcement
- emit user-visible output

If you feel tempted to do so, escalate.

---

## Output Plane Is the Final Gate

Nothing reaches a user unless:
- it passes output admissibility schema validation
- authority checks are satisfied
- enforcement checks pass

Formatting logic must never override admissibility decisions.

Rejections are final.

---

## Datasets Are Informational Only

Datasets:
- inform decisions
- do not grant authority
- do not override rules
- do not justify behavior alone

Never hardcode dataset logic into enforcement.

---

## Diagnostics Are Not Optional

Diagnostics exist to:
- catch drift
- prevent silent regression
- enforce design intent

If diagnostics fail:
- do not disable them
- do not work around them
- fix the underlying issue

---

## Amendment Protocol

Any change to:
- constitutional documents
- enforcement semantics
- authority boundaries

**must follow the amendment protocol.**

If you are unsure whether a change qualifies, assume it does.

---

## When in Doubt

Default to:
- refusal
- clarification
- non-execution

SkillSpring’s purpose is not to answer every question.

Its purpose is to ensure it never answers the *wrong* ones.

---

## Final Warning

SkillSpring is designed to survive:
- audits
- adversarial users
- regulatory scrutiny
- future you

Treat it accordingly.
