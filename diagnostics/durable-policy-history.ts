import assert from "node:assert/strict";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { fork } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { SqlitePolicyHistoryStore } from "../scripts/review-policy/history-store.js";
import { DurablePolicySimulation, policyTrustDigest } from "../scripts/review-policy/durable-boundary.js";
import { artifactSigningBytes, type SignedArtifact, type TrustedKey } from "../scripts/review-policy/verifier.js";
import { makePolicySnapshotFixture } from "./scoped-policy-boundary.js";
import { policyDigest, type ScopedSubject } from "../scripts/review-policy/boundary.js";
import { draftPolicy } from "../scripts/review-policy/policy.js";
import { reviewSubjectHash, type ReviewRecord } from "../scripts/review-policy/simulate.js";

function childFixture(file: string) {
  const child = fork(resolve("diagnostics/durable-policy-history-worker.ts"), [file],
    { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let result: any;
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolveReady, reject) => { readyResolve = resolveReady; readyReject = reject; });
  const finished = new Promise<{ code: number | null; result: any }>((resolveDone, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("history worker timeout")); }, 15000);
    child.on("message", (message: any) => {
      if (message.ready) readyResolve();
      if (message.result) result = message.result;
    });
    child.on("error", error => { readyReject(error); reject(error); });
    child.on("exit", code => {
      clearTimeout(timer); readyReject(new Error("worker exited before ready")); resolveDone({ code, result });
    });
  });
  // Callers await both paths; avoid an unhandled rejection if startup fails first.
  void ready.catch(() => undefined); void finished.catch(() => undefined);
  return { child, ready, finished };
}

export async function checkDurablePolicyHistory() {
  const tempRoot = realpathSync(tmpdir());
  const root = mkdtempSync(join(tempRoot, "skillspring-history-"));
  const handles: SqlitePolicyHistoryStore[] = [];
  const signing = { publisher: generateKeyPairSync("ed25519"), next: generateKeyPairSync("ed25519"),
    reviewer: generateKeyPairSync("ed25519"), other: generateKeyPairSync("ed25519") };
  const keys: TrustedKey[] = Object.entries(signing).map(([id, pair]) => ({
    id, organization: "team-a", principal: id === "next" ? "publisher" : id,
    purposes: id === "reviewer" || id === "other" ? ["review"] : ["snapshot"],
    notBefore: 0, expiresAt: 1000, publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString()
  }));
  const trustDigest = policyTrustDigest(keys);
  const seal = (unsigned: Omit<SignedArtifact, "signature">, key: KeyObject) => ({
    ...unsigned, signature: sign(null, artifactSigningBytes(unsigned), key).toString("base64")
  });
  const snapshot = (revision = 1, id = "snapshot-1", key: "publisher" | "next" = "publisher") => seal({
    schema_version: "skillspring.signed-policy-artifact.draft.v1", algorithm: "Ed25519", kind: "snapshot",
    key_id: key, organization: "team-a", artifact_id: id, revision, issued_at: 0, expires_at: 200,
    payload: { ...makePolicySnapshotFixture(), id }
  }, signing[key].privateKey);
  const subject: ScopedSubject = { candidate: { text: "fixture" }, accessMode: "DEFAULT", domain: "engineering",
    resource: "public/guide", audience: ["alice"], requester: "alice", producer: "model", policyVersion: draftPolicy.version,
    purpose: "education", environment: "development", organization: "team-a", policy_digest: policyDigest };
  const binding = reviewSubjectHash(subject);
  const review = (decision: "APPROVE" | "REJECT", revision = 1, id = "review-1", expiresAt = 200,
    reviewer: "reviewer" | "other" = "reviewer", subjectHash = binding) => {
    const record: ReviewRecord = { id, reviewer, role: "domain_reviewer", subjectHash, decision,
      evidence: "VERIFIED", authorityClaims: "CLEARED", outputChecks: "PASS", reviewedAt: 50, expiresAt, revoked: false };
    return seal({ schema_version: "skillspring.signed-policy-artifact.draft.v1", algorithm: "Ed25519", kind: "review",
      key_id: reviewer, organization: "team-a", artifact_id: id, revision, issued_at: 50, expires_at: expiresAt, payload: record
    }, signing[reviewer].privateKey);
  };
  const request = { actor: "alice", mode: "DEFAULT", domain: "engineering", resource: "public/guide",
    operation: "read", purpose: "education", environment: "development", organization: "team-a", policy_digest: policyDigest };
  const open = (name: string, create = false) => {
    const path = join(root, `${name}.sqlite`);
    const store = create ? SqlitePolicyHistoryStore.create(path, "team-a", trustDigest) : SqlitePolicyHistoryStore.open(path, "team-a", trustDigest);
    handles.push(store);
    return { path, store, simulation: new DurablePolicySimulation(store, keys) };
  };
  const count = (store: SqlitePolicyHistoryStore) => store.transaction(history => history.length);
  try {
    let setup = open("restart", true);
    const v1 = snapshot(), v2 = snapshot(2, "snapshot-2"), v3 = snapshot(3, "snapshot-3");
    assert.equal(setup.simulation.acceptSnapshot(v2, 100).accepted, true);
    setup.store.close(); setup = open("restart");
    assert.equal(setup.simulation.acceptSnapshot(v1, 100).reason, "REVISION_ROLLBACK");
    assert.equal(setup.simulation.acceptSnapshot(v2, 100).accepted, true);
    assert.equal(count(setup.store), 1); // Same signed observation at same time is idempotent.
    assert.equal(setup.simulation.acceptSnapshot(v2, 99).reason, "INVALID_OR_ROLLED_BACK_CLOCK");
    assert.equal(setup.simulation.acceptSnapshot({ ...v2, revision: 999 }, 100).accepted, false);
    assert.equal(setup.simulation.acceptSnapshot(v3, 100).accepted, true);
    assert.throws(() => SqlitePolicyHistoryStore.open(setup.path, "team-b", trustDigest), /MISMATCH/);
    assert.throws(() => SqlitePolicyHistoryStore.open(setup.path, "team-a", policyTrustDigest(keys.slice(1))), /MISMATCH/);

    for (const kind of ["key", "artifact"] as const) {
      let rev = open(`revocation-${kind}`, true);
      assert.equal((kind === "key" ? rev.simulation.revokeKey("publisher", 100) :
        rev.simulation.revokeArtifact("snapshot", "snapshot-1", 100)).accepted, true);
      rev.store.close(); rev = open(`revocation-${kind}`);
      assert.equal(rev.simulation.acceptSnapshot(v1, 100).accepted, false);
      assert.equal(rev.simulation.acceptSnapshot(snapshot(2, "snapshot-2", "next"), 100).accepted, true);
      assert.equal(rev.simulation.revokeKey("next", 99).reason, "INVALID_OR_ROLLED_BACK_CLOCK");
    }

    let approvals = open("reviews", true);
    assert.equal(approvals.simulation.acceptReview(review("APPROVE"), binding, 100).accepted, true);
    assert.equal(approvals.simulation.checkReview(subject, v1, 100).review_complete, true);
    assert.equal(approvals.simulation.checkReview(subject, v1, 100).release_authorized, false);
    for (const changed of [{ ...subject, candidate: { text: "changed" } }, { ...subject, audience: ["reviewer"] },
      { ...subject, policyVersion: "changed" }, { ...subject, policy_digest: `sha256:${"0".repeat(64)}` }]) {
      assert.equal(approvals.simulation.checkReview(changed, v1, 100).review_complete, false);
    }
    assert.equal(approvals.simulation.acceptReview(review("APPROVE", 2, "review-1", 200, "other"), binding, 100).reason,
      "REVIEW_IDENTITY_CONFLICT");
    assert.equal(approvals.simulation.acceptReview(review("REJECT", 2, "review-1", 120), binding, 100).accepted, true);
    approvals.store.close(); approvals = open("reviews");
    // checkReview has no records-list parameter, so a caller cannot omit the stored rejection.
    assert.equal(approvals.simulation.checkReview(subject, v1, 100).reason, "REVIEW_REJECTED");
    assert.equal(approvals.simulation.acceptReview(review("APPROVE", 1, "new-id"), binding, 100).reason, "REVIEW_IDENTITY_CONFLICT");
    assert.equal(approvals.simulation.acceptReview(review("APPROVE", 3), binding, 100).accepted, true);
    assert.equal(approvals.simulation.checkReview(subject, v1, 150).reason, "REVIEW_REJECTED");
    assert.equal(approvals.simulation.revokeArtifact("review", "review-1", 150).accepted, true);
    assert.equal(approvals.simulation.revokeKey("reviewer", 150).accepted, true);
    approvals.store.close(); approvals = open("reviews");
    assert.equal(approvals.simulation.checkReview(subject, v1, 150).reason, "REVIEW_REJECTED");

    for (const kind of ["key", "artifact", "expiry"] as const) {
      let rev = open(`review-invalid-${kind}`, true);
      rev.simulation.acceptReview(review("APPROVE", 1, "review-1", 120), binding, 100);
      if (kind === "key") rev.simulation.revokeKey("reviewer", 100);
      if (kind === "artifact") rev.simulation.revokeArtifact("review", "review-1", 100);
      rev.store.close(); rev = open(`review-invalid-${kind}`);
      assert.equal(rev.simulation.checkReview(subject, v1, kind === "expiry" ? 150 : 100).review_complete, false);
    }

    const failed = open("failed-write", true);
    const injection = new DatabaseSync(failed.path);
    injection.exec("CREATE TRIGGER fail_commit BEFORE UPDATE ON metadata BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END;");
    assert.equal(failed.simulation.acceptSnapshot(v2, 100).accepted, false);
    assert.equal(count(failed.store), 0);
    injection.exec("DROP TRIGGER fail_commit;"); injection.close(); failed.store.close();
    const recovered = open("failed-write");
    assert.equal(recovered.simulation.acceptSnapshot(v1, 100).accepted, true);
    assert.equal(recovered.simulation.checkAccess(request, v1, 100).would_permit, true);
    assert.equal(recovered.simulation.checkAccess(request, v1, 100).access_authorized, false);
    const lock = new DatabaseSync(recovered.path); lock.exec("BEGIN IMMEDIATE");
    try { assert.equal(recovered.simulation.checkAccess(request, v1, 100).would_permit, false); }
    finally { lock.exec("ROLLBACK"); lock.close(); }
    recovered.store.close();
    assert.equal(recovered.simulation.checkAccess(request, v1, 100).would_permit, false);

    for (const corruption of ["payload", "truncated"] as const) {
      const corrupt = open(corruption, true); corrupt.simulation.acceptSnapshot(v1, 100); corrupt.store.close();
      const db = new DatabaseSync(corrupt.path);
      assert.throws(() => db.exec("DELETE FROM events"), /APPEND_ONLY/);
      if (corruption === "payload") db.exec("DROP TRIGGER events_no_update; UPDATE events SET payload='{}';");
      else db.exec("DROP TRIGGER events_no_delete; DELETE FROM events;");
      db.close();
      assert.throws(() => open(corruption), /CORRUPT/);
    }
    assert.throws(() => open("missing"));
    const brokenPath = join(root, "broken.sqlite"); writeFileSync(brokenPath, "not a database");
    assert.throws(() => open("broken"));

    // Two independent processes race on the same revision with different signed content.
    const concurrent = open("concurrent", true); concurrent.store.close();
    const variants = [snapshot(1, "race-a"), snapshot(1, "race-b")];
    const workers: ReturnType<typeof childFixture>[] = [];
    try {
      // Open sequentially, then race the writes. Startup locking is tested separately.
      for (const [index, artifact] of variants.entries()) {
        const file = join(root, `worker-${index}.json`);
        writeFileSync(file, JSON.stringify({ path: concurrent.path, keys, artifact }));
        const worker = childFixture(file); workers.push(worker);
        await worker.ready;
      }
      workers.forEach(worker => worker.child.send("start"));
      const outcomes = await Promise.all(workers.map(worker => worker.finished));
      assert.ok(outcomes.every(outcome => outcome.code === 0));
      assert.equal(outcomes.filter(outcome => outcome.result.accepted).length, 1);
      const winner = outcomes.findIndex(outcome => outcome.result.accepted);
      const stored = open("concurrent");
      assert.equal(stored.simulation.acceptSnapshot(variants[winner], 100).accepted, true);
      assert.equal(stored.simulation.acceptSnapshot(variants[1 - winner], 100).reason, "REVISION_CONFLICT");
    } finally {
      workers.forEach(worker => { if (worker.child.exitCode === null) worker.child.kill(); });
      await Promise.allSettled(workers.map(worker => worker.finished));
    }

    const crash = open("crash", true); crash.store.close();
    const crashFile = join(root, "crash.json");
    writeFileSync(crashFile, JSON.stringify({ path: crash.path, keys, artifact: v2, crash: true }));
    const worker = childFixture(crashFile);
    try {
      await worker.ready; worker.child.send("start");
      assert.equal((await worker.finished).code, 17);
      const afterCrash = open("crash");
      assert.equal(count(afterCrash.store), 0);
      assert.equal(afterCrash.simulation.acceptSnapshot(v1, 100).accepted, true);
    } finally {
      if (worker.child.exitCode === null) worker.child.kill();
      await Promise.allSettled([worker.finished]);
    }
  } finally {
    handles.forEach(handle => handle.close());
    const target = realpathSync(root), within = relative(tempRoot, target);
    assert.ok(within && !within.startsWith("..") && !isAbsolute(within));
    rmSync(target, { recursive: true, force: true });
  }
}
