import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { makeCandidateReviewFixture } from "./candidate-review-fixture.js";
import { SqlitePolicyHistoryStore } from "../scripts/review-policy/history-store.js";
import { DurablePolicySimulation, policyTrustDigest } from "../scripts/review-policy/durable-boundary.js";

async function main() {
  const base = realpathSync(tmpdir()), root = mkdtempSync(join(base, "skillspring-review-demo-"));
  const reports = [];
  try {
    for (const mode of ["DEFAULT", "GOVERNANCE", "ARCHITECT"] as const) {
      const fixture = await makeCandidateReviewFixture(mode);
      const path = join(root, `${mode}.sqlite`);
      let store = SqlitePolicyHistoryStore.create(path, "team-a", policyTrustDigest(fixture.keys));
      try {
        let simulation = new DurablePolicySimulation(store, fixture.keys);
        const check = () => simulation.checkCandidateReview(fixture.subject, fixture.context, fixture.signedSnapshot(), fixture.now);
        const pending = check(); assert.equal(pending.review_complete, false);
        for (const who of fixture.requiredReviewers) {
          assert.equal(simulation.acceptCandidateReview(fixture.subject, fixture.context, fixture.signedReview(who), fixture.now).accepted, true);
        }
        const assessed = check(); assert.equal(assessed.review_complete, true);
        const rejectedBy = fixture.requiredReviewers[0];
        assert.equal(simulation.acceptCandidateReview(fixture.subject, fixture.context,
          fixture.signedReview(rejectedBy, { decision: "REJECT" }, 2), fixture.now).accepted, true);
        store.close();
        store = SqlitePolicyHistoryStore.open(path, "team-a", policyTrustDigest(fixture.keys));
        simulation = new DurablePolicySimulation(store, fixture.keys);
        const reopened = check(); assert.equal(reopened.reason, "REVIEW_REJECTED");
        reports.push({ mode, fixture_reviewers_required: fixture.requiredReviewers.length,
          before_reviews: pending.reason, after_fixture_assessments: assessed.reason,
          after_rejection_and_restart: reopened.reason, release_authorized: false });
      } finally { store.close(); }
    }
    console.log(JSON.stringify({ schema_version: "skillspring.candidate-review-demo.v1", synthetic: true, passed: true,
      human_review_performed: false, provider_called: false, reports,
      note: "Synthetic evidence and ephemeral test signers only. No access or answer release authorized." }, null, 2));
  } finally {
    const target = realpathSync(root), within = relative(base, target);
    assert.ok(within && !within.startsWith("..") && !isAbsolute(within));
    rmSync(target, { recursive: true, force: true });
  }
}
main().catch(() => { console.error("Candidate review demonstration failed."); process.exitCode = 1; });
