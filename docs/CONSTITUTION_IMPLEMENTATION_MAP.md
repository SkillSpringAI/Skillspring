# Constitution-to-Implementation Map

This map identifies the current enforcement surfaces for the registered
runtime invariants. The machine-readable source is
`schemas/registries/invariant-implementation-map.json`; diagnostics verify
that its referenced paths exist.

| Invariant | Current enforcement | Diagnostics |
| --- | --- | --- |
| INV-001 — emitted failures bind to registered authority | `runtime/lumens.ts`, `runtime/outputGate.ts` | `diagnostics/lumens-verification.ts`, `diagnostics/refusal-binding-v2.ts` |
| INV-002 — emitted failures use registered failure codes | `runtime/lg.ts`, `runtime/outputGate.ts` | `diagnostics/lg-mapping.ts`, `diagnostics/failure-code-registry-tests.ts` |
| INV-010 — scoped retry preserves protected dispositions | `runtime/lg.ts` | `diagnostics/lg-mapping.ts` |
| INV-020 — authority artifact mismatch requires rebuild | `runtime/authority/artifacts.ts`, `runtime/pipeline.ts` | `diagnostics/authority-artifacts.ts` |
| INV-030 — all outputs pass admissibility validation | `runtime/outputGate.ts`, `schemas/output.schema.json` | `diagnostics/output-invariants.ts` |
| INV-031 — capability leakage is refused | `runtime/outputGate.ts` | `diagnostics/capability-guard-tests.ts` |
| INV-032 — output refusals bind to registered invariants | `runtime/outputGate.ts` | `diagnostics/refusal-binding-v2.ts` |

This is a current map, not a claim that constitutional coverage is complete.
Future authority, execution, replay, and integration rules must add mappings
before they are treated as enforced runtime invariants.
