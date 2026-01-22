import fs from "node:fs";
import path from "node:path";

const roots = ["runtime", "src", "diagnostics"];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && p.endsWith(".ts")) out.push(p);
  }
  return out;
}

function rewriteImports(text) {
  // Handles: import ... from "./x" | "../x" | "./x.ts"
  // Leaves: ".js", ".json", ".node" intact, and leaves bare specifiers intact.
  return text.replace(
    /(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
    (m, a, spec, c) => {
      if (spec.endsWith(".js") || spec.endsWith(".json") || spec.endsWith(".node")) return m;
      if (spec.endsWith(".ts")) return `${a}${spec.slice(0, -3)}.js${c}`;
      return `${a}${spec}.js${c}`;
    }
  );
}

let changed = 0;
for (const r of roots) {
  for (const file of walk(r)) {
    const before = fs.readFileSync(file, "utf8");
    const after = rewriteImports(before);
    if (after !== before) {
      fs.writeFileSync(file, after, "utf8");
      changed++;
    }
  }
}

console.log(`Rewrote imports in ${changed} file(s).`);
