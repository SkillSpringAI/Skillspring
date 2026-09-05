/** Draft examples, not an active authority registry. Domain/resource names are configurable. */
export const draftPolicy = {
  version: "skillspring.access-review-policy.draft.v1",
  status: "SIMULATION_ONLY",
  modes: {
    DEFAULT: {
      roles: ["user", "domain_reviewer", "governance_officer", "engineering_maintainer", "access_administrator"],
      classes: ["public"], operations: ["read", "request_review"]
    },
    GOVERNANCE: {
      roles: ["domain_reviewer", "governance_officer"],
      classes: ["public", "domain_restricted"], operations: ["read", "request_review", "review_evidence", "review_release"]
    },
    ARCHITECT: {
      roles: ["engineering_maintainer"],
      classes: ["public", "engineering_sandbox"], operations: ["read", "request_review", "test", "debug", "propose_change", "review_release"]
    }
  },
  reviewerRoles: {
    DEFAULT: ["domain_reviewer"],
    GOVERNANCE: ["domain_reviewer", "governance_officer"],
    ARCHITECT: ["engineering_maintainer", "governance_officer"]
  }
} as const;
