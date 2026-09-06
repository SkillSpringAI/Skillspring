import { readFileSync } from "node:fs";
import { SqlitePolicyHistoryStore } from "../scripts/review-policy/history-store.js";
import { DurablePolicySimulation, policyTrustDigest } from "../scripts/review-policy/durable-boundary.js";

// Child-process fixture receives public keys and synthetic signed artifacts only.
const fixture = JSON.parse(readFileSync(process.argv[2], "utf8"));
const store = SqlitePolicyHistoryStore.open(fixture.path, "team-a", policyTrustDigest(fixture.keys));
const simulation = new DurablePolicySimulation(store, fixture.keys);
process.send?.({ ready: true });
process.once("message", () => {
  if (fixture.crash) {
    store.transaction((_history, append) => {
      append({ type: "artifact", artifact: fixture.artifact, subjectHash: null, now: 100 });
      process.exit(17); // Abrupt exit before metadata update and COMMIT.
    });
  }
  const result = simulation.acceptSnapshot(fixture.artifact, 100);
  store.close();
  process.send?.({ result });
  process.disconnect?.();
});
