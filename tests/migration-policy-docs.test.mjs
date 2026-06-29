import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = await readFile(path.join(root, "plugin", "docs", "migration-policy.md"), "utf8");

assert.match(doc, /Current artifact schema version: `0\.1\.0`/);
assert.match(doc, /does not silently rewrite artifacts/);
assert.match(doc, /`0\.0\.0` to `0\.1\.0` is the only documented no-op migration/);
assert.match(doc, /release-checklist\.md/);

console.log("Migration policy documents schema version compatibility and upgrade handling.");
