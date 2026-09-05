import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function must(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

const FORBIDDEN_IMPORTS = [
  "node:child_process",
  "child_process",
  "node:fs",
  "fs",
  "node:http",
  "http",
  "node:https",
  "https",
  "node:net",
  "net",
  "node:dgram",
  "dgram",
  "node:worker_threads",
  "worker_threads"
];

// Allowlist: diagnostics themselves can import fs/path because they need to read files.
// We only scan runtime/ and src/ for forbidden imports.
const SCAN_DIRS = ["runtime", "src"];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const items = readdirSync(dir);
  for (const item of items) {
    const p = join(dir, item);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

function fileContainsForbiddenImport(path: string, content: string): string | null {
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Only consider import/require lines to reduce false positives.
    const isImportLine =
      line.startsWith("import ") ||
      line.startsWith("export ") ||
      line.includes("require(");

    if (!isImportLine) continue;

    // Approved local listener only: no default, namespace, client, or core imports.
    if (path.replace(/\\/g, "/") === "src/http-server.ts" &&
        line === 'import { createServer } from "node:http";') continue;

    const hit = FORBIDDEN_IMPORTS.find((m) => line.includes(`"${m}"`) || line.includes(`'${m}'`));
    if (hit) return `${hit} (line ${i + 1})`;
  }

  return null;
}

export function checkNegativeCapabilities(): void {
  must(!fileContainsForbiddenImport("src/http-server.ts", 'import { createServer } from "node:http";'), "local server exception missing");
  for (const [file, source] of [
    ["runtime/api/evaluate.ts", 'import { createServer } from "node:http";'],
    ["src/http-server.ts", 'import { request } from "node:http";'],
    ["src/http-server.ts", 'import http from "node:http";'],
    ["src/serve.ts", 'import { createServer } from "node:http";']
  ]) must(fileContainsForbiddenImport(file, source), "network exception expanded beyond the local listener");
  for (const d of SCAN_DIRS) {
    const files = listFiles(d).filter((p) => p.endsWith(".ts"));
    for (const f of files) {
      const c = readFileSync(f, "utf8");
      const hit = fileContainsForbiddenImport(f, c);
      must(!hit, `negative-capability: forbidden module import in ${f}: ${hit}`);
    }
  }

  // Extra: ensure we don't accidentally leak environment in outputs.
  // This is a cheap tripwire. If you ever intentionally add env reporting, update this test.
  const sample = JSON.stringify(process.env ?? {});
  must(!sample.toLowerCase().includes("api_key"), "negative-capability: process.env appears to contain api_key string");
  must(!sample.toLowerCase().includes("secret"), "negative-capability: process.env appears to contain secret string");

  console.log("DIAG negative-capability: PASS");
}
