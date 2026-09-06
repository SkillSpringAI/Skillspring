import { DatabaseSync } from "node:sqlite";
import { closeSync, openSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { hashPolicyJson } from "./simulate.js";
import type { SignedArtifact } from "./verifier.js";

export type HistoryEvent =
  | { type: "artifact"; now: number; artifact: SignedArtifact; subjectHash: string | null }
  | { type: "revoke-key"; now: number; keyId: string }
  | { type: "revoke-artifact"; now: number; kind: "snapshot" | "review"; artifactId: string };

/** Trusted storage boundary. The callback is synchronous; any failure rolls back all appends. */
export interface PolicyHistoryStore {
  readonly organization: string;
  readonly trustDigest: string;
  transaction<T>(work: (history: readonly HistoryEvent[], append: (event: HistoryEvent) => void) => T): T;
  close(): void;
}

/** Local simulation storage, not protection against a compromised filesystem or full backup rollback. */
export class SqlitePolicyHistoryStore implements PolicyHistoryStore {
  #db: DatabaseSync;
  #path: string;
  #identity: { dev: number; ino: number };
  #active = false;
  #closed = false;
  private constructor(path: string, readonly organization: string, readonly trustDigest: string, create: boolean) {
    if (!organization || !/^sha256:[a-f0-9]{64}$/.test(trustDigest)) throw new Error("INVALID_STORE_CONFIGURATION");
    this.#path = resolve(path);
    if (create) closeSync(openSync(this.#path, "wx", 0o600));
    // Opening is deliberately separate from creation; missing stores are never silently reset.
    const before = statSync(this.#path);
    if (!before.isFile()) throw new Error("STORE_UNAVAILABLE");
    this.#identity = { dev: before.dev, ino: before.ino };
    this.#db = new DatabaseSync(this.#path);
    try {
      this.#assertFile();
      this.#db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=0;");
      if (create) {
        this.#db.exec(`BEGIN IMMEDIATE;
          CREATE TABLE metadata (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL,
            organization TEXT NOT NULL, trust_digest TEXT NOT NULL, tail INTEGER NOT NULL, digest TEXT NOT NULL);
          CREATE TABLE events (sequence INTEGER PRIMARY KEY, payload TEXT NOT NULL, digest TEXT NOT NULL);
          CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;
          CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;`);
        this.#db.prepare("INSERT INTO metadata VALUES (1, 1, ?, ?, 0, ?)")
          .run(organization, trustDigest, this.#seed());
        this.#db.exec("COMMIT");
      }
      this.transaction(() => undefined);
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }
  static create(path: string, organization: string, trustDigest: string) {
    return new SqlitePolicyHistoryStore(path, organization, trustDigest, true);
  }
  static open(path: string, organization: string, trustDigest: string) {
    return new SqlitePolicyHistoryStore(path, organization, trustDigest, false);
  }
  #seed() { return hashPolicyJson({ version: 1, organization: this.organization, trustDigest: this.trustDigest }); }
  #assertFile() {
    const file = statSync(this.#path);
    if (!file.isFile() || file.dev !== this.#identity.dev || file.ino !== this.#identity.ino) throw new Error("STORE_REPLACED");
  }
  transaction<T>(work: (history: readonly HistoryEvent[], append: (event: HistoryEvent) => void) => T): T {
    if (this.#closed || this.#active) throw new Error("STORE_UNAVAILABLE");
    this.#assertFile();
    this.#db.exec("BEGIN IMMEDIATE");
    this.#active = true;
    try {
      const meta = this.#db.prepare("SELECT * FROM metadata WHERE id=1").get();
      if (!meta || meta.version !== 1 || meta.organization !== this.organization || meta.trust_digest !== this.trustDigest) {
        throw new Error("STORE_CONFIGURATION_MISMATCH");
      }
      const rows = this.#db.prepare("SELECT sequence, payload, digest FROM events ORDER BY sequence").all();
      let tail = 0, digest = this.#seed();
      const history: HistoryEvent[] = [];
      for (const row of rows) {
        const event = JSON.parse(String(row.payload)) as HistoryEvent;
        if (row.sequence !== tail + 1) throw new Error("STORE_HISTORY_CORRUPT");
        digest = hashPolicyJson({ previous: digest, sequence: ++tail, event });
        if (digest !== row.digest) throw new Error("STORE_HISTORY_CORRUPT");
        history.push(event);
      }
      if (meta.tail !== tail || meta.digest !== digest) throw new Error("STORE_HISTORY_CORRUPT");
      let changed = false;
      let open = true;
      let result: T;
      try {
        result = work(history, event => {
          if (!open) throw new Error("TRANSACTION_CLOSED");
          if (tail >= 10000) throw new Error("STORE_CAPACITY_REACHED");
          digest = hashPolicyJson({ previous: digest, sequence: ++tail, event });
          this.#db.prepare("INSERT INTO events VALUES (?, ?, ?)").run(tail, JSON.stringify(event), digest);
          changed = true;
        });
        if (result && typeof (result as any).then === "function") throw new Error("ASYNC_TRANSACTION_FORBIDDEN");
      } finally { open = false; }
      if (changed) this.#db.prepare("UPDATE metadata SET tail=?, digest=? WHERE id=1").run(tail, digest);
      this.#assertFile();
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.#db.exec("ROLLBACK"); } catch { /* Caller still receives failure. */ }
      throw error;
    } finally { this.#active = false; }
  }
  close() { if (!this.#closed) { this.#db.close(); this.#closed = true; } }
}
