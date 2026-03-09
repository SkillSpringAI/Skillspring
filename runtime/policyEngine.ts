import type { Mode } from "./types.js";

export function decideAllowDecisionCode(mode: Mode): string {
  if (mode === "DEFAULT") return "ALLOW_DEFAULT_SAFE";
  if (mode === "GOVERNANCE") return "ALLOW_GOVERNED_SAFE";
  return "ALLOW_ARCHITECT_SAFE";
}
