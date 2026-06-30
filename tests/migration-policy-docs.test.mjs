import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACT_SCHEMA_VERSION } from "../src/contracts/constants.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = await readFile(path.join(root, "plugin", "docs", "migration-policy.md"), "utf8");

assert.match(doc, new RegExp(`Current artifact schema version: \`${CONTRACT_SCHEMA_VERSION.replaceAll(".", "\\.")}\``));
assert.match(doc, /does not silently rewrite artifacts/);
assert.match(doc, new RegExp(`\`0\\.0\\.0\` to \`${CONTRACT_SCHEMA_VERSION.replaceAll(".", "\\.")}\` is the only documented no-op migration`));
assert.match(doc, /release-checklist\.md/);

console.log("Migration policy documents schema version compatibility and upgrade handling.");
