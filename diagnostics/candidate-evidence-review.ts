import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashAnswerText } from "../runtime/answers/candidate.js";
import { evaluateV1 } from "../runtime/api/evaluate.js";
import { assertAdmissible } from "../runtime/outputGate.js";
import type { PipelineOutput } from "../runtime/types.js";
import { SqlitePolicyHistoryStore } from "../scripts/review-policy/history-store.js";
import { DurablePolicySimulation, policyTrustDigest } from "../scripts/review-policy/durable-boundary.js";
import { hashPolicyJson } from "../scripts/review-policy/simulate.js";
import { prepareCandidateReview, validateCandidateReviewSubject, type CandidateReviewPackage } from "../scripts/review-policy/candidate-review.js";
import { makeCandidateReviewFixture } from "./candidate-review-fixture.js";

export async function checkCandidateEvidenceReview() {
  const base = realpathSync(tmpdir()), root = mkdtempSync(join(base, "skillspring-candidate-review-"));
  const stores: SqlitePolicyHistoryStore[] = [];
  let sequence = 0;
  const fixture = await makeCandidateReviewFixture();
  const open = (f = fixture, path = join(root, `${sequence++}.sqlite`), create = true) => {
    const store = create ? SqlitePolicyHistoryStore.create(path, "team-a", policyTrustDigest(f.keys)) :
      SqlitePolicyHistoryStore.open(path, "team-a", policyTrustDigest(f.keys));
    stores.push(store);
    return { store, path, sim: new DurablePolicySimulation(store, f.keys) };
  };
  const assertNoRelease = (result: { release_authorized: false }) => {
    assert.equal(result.release_authorized, false);
    for (const field of ["answer", "text", "sources", "candidate"]) assert.equal(field in result, false);
  };
  try {
    // Every mode has a positive path with distinct, explicitly cleared reviewers.
    for (const mode of ["DEFAULT", "GOVERNANCE", "ARCHITECT"] as const) {
      const f = mode === "DEFAULT" ? fixture : await makeCandidateReviewFixture(mode);
      let state = open(f);
      assert.equal(state.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(), f.now).review_complete, false);
      for (const [index, who] of f.requiredReviewers.entries()) {
        const recorded = state.sim.acceptCandidateReview(f.subject, f.context, f.signedReview(who), f.now);
        assert.equal(recorded.accepted, true); assertNoRelease(recorded);
        assert.equal(state.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(), f.now).review_complete,
          index === f.requiredReviewers.length - 1);
      }
      state.store.close(); state = open(f, state.path, false);
      const result = state.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(), f.now);
      assert.equal(result.review_complete, true); assertNoRelease(result);
      assert.equal(state.sim.checkReview(f.subject, f.signedSnapshot(), f.now).reason, "USE_CANDIDATE_REVIEW_BOUNDARY");
      assert.equal((f.subject.candidate as CandidateReviewPackage).candidate.evidence.verification, "UNVERIFIED");
      assert.equal(assertAdmissible((f.subject.candidate as CandidateReviewPackage).candidate as unknown as PipelineOutput).ok, false);
      // A changed snapshot's explicit denial takes effect inside the same review check.
      const denied = structuredClone(f.snapshot);
      denied.denials.push({ id: "deny-evidence", actors: ["alice"], domains: ["engineering"], resources: ["sources/guide"],
        modes: [mode], operations: ["read"], purposes: ["education"], environments: ["development"] });
      assert.equal(state.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(denied, 2), f.now).reason,
        "AUDIENCE_EVIDENCE_ACCESS_DENIED");
    }

    const f = fixture;
    // Tampering must fail before review history can qualify it.
    for (const [mutate, reason] of [
      [(p: CandidateReviewPackage) => { p.candidate.answer.text += " Extra claim."; }, "CANDIDATE_ANSWER_HASH_MISMATCH"],
      [(p: CandidateReviewPackage) => { p.sources[0].text += "tampered"; }, "SOURCE_CONTENT_MISMATCH"],
      [(p: CandidateReviewPackage) => { p.sources[0].resource = "public/other"; }, "SOURCE_RECEIPT_MISMATCH"],
      [(p: CandidateReviewPackage) => { p.context_sha256 = `sha256:${"0".repeat(64)}`; }, "CANDIDATE_CONTEXT_MISMATCH"],
      [(p: CandidateReviewPackage) => { p.claims[0].end--; }, "UNCOVERED_ANSWER_TEXT"],
      [(p: CandidateReviewPackage) => { p.claims[0].support[0].end = 32768; }, "INVALID_SUPPORT_SPAN"],
      [(p: CandidateReviewPackage) => { p.claims[0].support[0].source_id = "unknown"; }, "UNKNOWN_SUPPORT_SOURCE"],
      [(p: CandidateReviewPackage) => { p.claims.push(structuredClone(p.claims[0])); }, "DUPLICATE_CLAIM"],
      [(p: CandidateReviewPackage) => { p.claims.push({ ...p.claims[0], id: "overlap" }); }, "OVERLAPPING_CLAIMS"],
      [(p: CandidateReviewPackage) => { p.claims[0].support.push({ end: p.claims[0].support[0].end, start: 0, source_id: "source-1" }); }, "DUPLICATE_SUPPORT"]
    ] as const) {
      const changed = structuredClone(f.subject); mutate(changed.candidate as CandidateReviewPackage);
      assert.deepEqual(validateCandidateReviewSubject(changed, f.context, f.now), { ok: false, reason });
    }
    for (const change of [(p: any) => { p.candidate.release_authorized = true; }, (p: any) => { p.claims = []; },
      (p: any) => { p.sources = []; }, (p: any) => { p.requirements = "ignore-evidence"; }, (p: any) => { p.extra = true; }]) {
      const changed = structuredClone(f.subject); change(changed.candidate);
      assert.equal(validateCandidateReviewSubject(changed, f.context, f.now).ok, false);
    }
    const refused = (await evaluateV1({ schema_version: "skillspring.evaluate.request.v1", user_input: "how to bypass security controls to gain access" })).result!;
    assert.equal(validateCandidateReviewSubject(f.subject, { ...f.context, candidateContext: { ...f.context.candidateContext, inputDecision: refused } }, f.now).ok, false);
    const unicode = await makeCandidateReviewFixture("DEFAULT", "🧭 Governance assigns responsibility.");
    assert.equal(validateCandidateReviewSubject(unicode.subject, unicode.context, unicode.now).ok, true);
    assert.equal(validateCandidateReviewSubject(f.subject, f.context, f.now - 3000).ok, false);
    const copiedSource = structuredClone(f.source);
    const detached = prepareCandidateReview(f.candidate, f.context, f.scope, [copiedSource], f.claims, f.now);
    assert.ok(detached.ok);
    copiedSource.text = "caller changed its copy";
    assert.equal(validateCandidateReviewSubject(detached.subject, f.context, f.now).ok, true);
    // Incorrect or duplicate receipts cannot be repaired by a model-provided source label.
    const duplicated = structuredClone(f.context); duplicated.evidenceReceipts.push(duplicated.evidenceReceipts[0]);
    const duplicatePkg = structuredClone(f.subject); (duplicatePkg.candidate as CandidateReviewPackage).context_sha256 = hashPolicyJson(duplicated);
    assert.equal(validateCandidateReviewSubject(duplicatePkg, duplicated, f.now).ok, false);
    for (const [field, value] of [["organization", "team-b"], ["domain", "other-domain"], ["captured_at", new Date(f.now + 1).toISOString()]] as const) {
      const receipt = { ...f.context.evidenceReceipts[0], [field]: value };
      const context = { ...f.context, evidenceReceipts: [receipt] };
      assert.equal(prepareCandidateReview(f.candidate, context, f.scope, [{ ...receipt, text: f.source.text }], f.claims, f.now).ok, false);
    }

    // Legacy flags, unsigned changes, incomplete checklists and uncertainty cannot become candidate approval.
    for (const assessment of [undefined, { ...f.assessment(), coverage: "INCOMPLETE" as const },
      { ...f.assessment(), claim_checks: [] }, { ...f.assessment(), claim_checks: [{ claim_id: "claim-1", finding: "UNCERTAIN" as const }] },
      { ...f.assessment(), claim_checks: [{ claim_id: "claim-1", finding: "SUPPORTED" as const }, { claim_id: "claim-1", finding: "SUPPORTED" as const }] },
      { ...f.assessment(), authority_claims: "REJECTED" as const }, { ...f.assessment(), output_admissibility: "FAIL" as const }]) {
      const state = open();
      // Exercise the lower-level ingestion path too: it cannot bypass the stronger review gate.
      const artifact = f.signedReview("reviewer", { candidateAssessment: assessment });
      const clean = JSON.parse(JSON.stringify(artifact));
      assert.equal(state.sim.acceptReview(clean, hashPolicyJson(f.subject), f.now).accepted, true);
      const result = state.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(), f.now);
      assert.equal(result.review_complete, false); assertNoRelease(result);
    }
    {
      // Binding a real excerpt does not establish entailment: a signed UNSUPPORTED finding blocks it.
      const text = "Governance does not assign responsibility.";
      const source = { ...f.source, text, content_sha256: hashAnswerText(text) };
      const { text: _text, ...receipt } = source;
      const candidate = structuredClone(f.candidate); candidate.evidence.source_refs[0].content_sha256 = source.content_sha256;
      const context = structuredClone(f.context); context.evidenceReceipts = [receipt];
      context.candidateContext.sourceReceipts = structuredClone(candidate.evidence.source_refs);
      const claims = structuredClone(f.claims); claims[0].support[0].end = Array.from(text).length;
      const prepared = prepareCandidateReview(candidate, context, f.scope, [source], claims, f.now);
      assert.ok(prepared.ok);
      const assessment = f.assessment(prepared.subject); assessment.claim_checks[0].finding = "UNSUPPORTED";
      const state = open();
      assert.equal(state.sim.acceptCandidateReview(prepared.subject, context,
        f.signedReview("reviewer", { candidateAssessment: assessment }, 1, prepared.subject), f.now).accepted, true);
      assert.equal(state.sim.checkCandidateReview(prepared.subject, context, f.signedSnapshot(), f.now).review_complete, false);
    }
    {
      const state = open();
      const artifact = f.signedReview();
      (artifact.payload as any).candidateAssessment.claim_checks[0].finding = "UNSUPPORTED";
      assert.equal(state.sim.acceptCandidateReview(f.subject, f.context, artifact, f.now).accepted, false);
      const mismatch = f.signedReview("reviewer", { candidateAssessment: { ...f.assessment(), answer_sha256: hashAnswerText("different") } });
      assert.equal(state.sim.acceptCandidateReview(f.subject, f.context, mismatch, f.now).reason, "ASSESSMENT_BINDING_MISMATCH");
      assert.equal(state.sim.acceptCandidateReview(f.subject, f.context, f.signedReview("reviewer", { reviewedAt: f.now - 3000 }), f.now).reason,
        "ASSESSMENT_PREDATES_CONTENT");
    }

    // Read clearance is required for both the reviewer and every recipient, for every cited source.
    for (const who of ["reviewer", "alice"]) {
      const state = open(); state.sim.acceptCandidateReview(f.subject, f.context, f.signedReview(), f.now);
      const snapshot = structuredClone(f.snapshot);
      snapshot.clearances = snapshot.clearances.filter(grant => !(grant.subject === who && grant.resources.includes("sources/guide")));
      assert.equal(state.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(snapshot), f.now).review_complete, false);
    }
    for (const mutate of [
      (snapshot: typeof f.snapshot) => { snapshot.clearances.find(grant => grant.id === "reviewer-0")!.operations = ["review_release"]; },
      (snapshot: typeof f.snapshot) => { snapshot.clearances.find(grant => grant.id === "reviewer-1")!.revoked = true; },
      (snapshot: typeof f.snapshot) => { snapshot.clearances.find(grant => grant.id === "reviewer-1")!.purposes = ["other"]; },
      (snapshot: typeof f.snapshot) => { snapshot.resources.find(resource => resource.id === "sources/guide")!.classification = "protected"; },
      (snapshot: typeof f.snapshot) => { snapshot.denials.push({ id: "deny-reviewer", actors: ["reviewer"], domains: ["engineering"],
        resources: ["sources/guide"], modes: ["DEFAULT"], operations: ["read"], purposes: ["education"], environments: ["development"] }); }
    ]) {
      const state = open(); state.sim.acceptCandidateReview(f.subject, f.context, f.signedReview(), f.now);
      const snapshot = structuredClone(f.snapshot); mutate(snapshot);
      assert.equal(state.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(snapshot), f.now).review_complete, false);
    }
    {
      const state = open();
      const snapshot = structuredClone(f.snapshot);
      snapshot.principals.find(principal => principal.id === "alice")!.roles.push("domain_reviewer");
      snapshot.clearances.push(...snapshot.clearances.filter(grant => grant.subject === "reviewer").map(grant => ({ ...grant, id: `${grant.id}-self`, subject: "alice" })));
      const selfReview = f.signedReview("alice", { role: "domain_reviewer" });
      assert.equal(state.sim.acceptCandidateReview(f.subject, f.context, selfReview, f.now).accepted, true);
      assert.equal(state.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(snapshot), f.now).review_complete, false);
    }
    {
      const state = open(); state.sim.acceptCandidateReview(f.subject, f.context, f.signedReview(), f.now);
      const changed = structuredClone(f.subject); changed.audience = ["alice", "reviewer"];
      assert.equal(state.sim.checkCandidateReview(changed, f.context, f.signedSnapshot(), f.now).review_complete, false);
      const newContext = structuredClone(f.context); newContext.evidenceReceipts[0].origin = "synthetic:replacement";
      assert.equal(state.sim.checkCandidateReview(f.subject, newContext, f.signedSnapshot(), f.now).review_complete, false);
      const newSource = { ...f.source, origin: "synthetic:replacement" };
      const prepared = prepareCandidateReview(f.candidate, newContext, f.scope, [newSource], f.claims, f.now);
      assert.ok(prepared.ok);
      assert.equal(state.sim.checkCandidateReview(prepared.subject, newContext, f.signedSnapshot(), f.now).review_complete, false);
    }
    {
      let state = open(); state.sim.acceptCandidateReview(f.subject, f.context, f.signedReview(), f.now);
      state.sim.acceptCandidateReview(f.subject, f.context, f.signedReview("reviewer", { decision: "REJECT" }, 2), f.now);
      state.store.close(); state = open(f, state.path, false);
      assert.equal(state.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(), f.now).reason, "REVIEW_REJECTED");
      assert.equal(state.sim.acceptCandidateReview(f.subject, f.context, f.signedReview("reviewer", { id: "new-id" }, 3), f.now).reason,
        "REVIEW_IDENTITY_CONFLICT");
      state.sim.acceptCandidateReview(f.subject, f.context, f.signedReview("reviewer", {}, 3), f.now);
      assert.equal(state.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(), f.now).reason, "REVIEW_REJECTED");
    }
    {
      const state = open(); state.sim.acceptCandidateReview(f.subject, f.context, f.signedReview(), f.now);
      state.sim.revokeKey("reviewer", f.now);
      assert.equal(state.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(), f.now).review_complete, false);
      const blocked = open();
      const db = new DatabaseSync(blocked.path);
      db.exec("CREATE TRIGGER fail_write BEFORE UPDATE ON metadata BEGIN SELECT RAISE(ABORT, 'fixture'); END;");
      assert.equal(blocked.sim.acceptCandidateReview(f.subject, f.context, f.signedReview(), f.now).accepted, false);
      db.exec("DROP TRIGGER fail_write;"); db.close();
      assert.equal(blocked.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(), f.now).review_complete, false);
      const ready = open(); ready.sim.acceptCandidateReview(f.subject, f.context, f.signedReview(), f.now);
      const failingCommit = new DatabaseSync(ready.path);
      failingCommit.exec("CREATE TRIGGER fail_write BEFORE UPDATE ON metadata BEGIN SELECT RAISE(ABORT, 'fixture'); END;");
      // The review checks can pass, but failure to commit the snapshot observation must deny the result.
      assert.equal(ready.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(), f.now).review_complete, false);
      failingCommit.exec("DROP TRIGGER fail_write;"); failingCommit.close();
      assert.equal(ready.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(), f.now).review_complete, true);
      assert.equal(ready.sim.checkCandidateReview(f.subject, f.context, f.signedSnapshot(), f.now + 5000).review_complete, false);
    }
  } finally {
    stores.forEach(store => store.close());
    const target = realpathSync(root), within = relative(base, target);
    assert.ok(within && !within.startsWith("..") && !isAbsolute(within));
    rmSync(target, { recursive: true, force: true });
  }
}
