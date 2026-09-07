import { writeFileSync } from "node:fs";

// TypeScript emits CommonJS. Give the build an explicit package boundary rather
// than inheriting the source package's ESM declaration.
writeFileSync(new URL("../dist/package.json", import.meta.url), '{"private":true,"type":"commonjs"}\n');
