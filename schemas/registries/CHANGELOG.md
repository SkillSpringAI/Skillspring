# Registry Changelog

This changelog records versioned changes to SkillSpring registries.

Rules:
- Versioned registry files are append-only (never edit old versions).
- Any new version requires:
  - new schemas/registries/*.vN.json
  - new runtime/registries/generated/*vN.ts
  - registryIndex updated to point "latest" to the new version
  - an entry here

## Unreleased
- (add entries here)

## 2026-03-03
- Added registry version v2:
  - invariants.v2.json: added INV-030, INV-031, INV-032 (Output Plane bindings)
  - failure-codes.v2.json: added OP-H-001, OP-H-002, OP-H-003
- Generated runtime registries updated: invariants.v2.ts, failureCodes.v2.ts
