/**
 * Control Plane Types
 * Purpose: Define explicit, minimal contracts for control decisions.
 */

export type ControlDecision =
  | { status: "allow"; mode: string }
  | { status: "clarify"; reason: string }
  | { status: "refuse"; reason: string };

export interface ControlContext {
  domain?: string;
  jurisdiction?: string;
  authorityRequested?: boolean;
}
