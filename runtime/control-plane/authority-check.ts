/**
 * Authority Check
 * Purpose: Verify that requested behavior is within constitutional bounds.
 * Authority: Gatekeeper only.
 */

export function checkAuthority(_request: unknown): never {
  throw new Error("Authority check not implemented. Control Plane stub.");
}
