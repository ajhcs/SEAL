import assert from "node:assert/strict";
import { mkdtemp, cp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { createRepoMap, writeRepoMap, validateRepoMap } from "../src/inventory/map-repo.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "repo-inventory");

const map = await createRepoMap(fixtureRoot);
const result = await validateRepoMap(map);
assert.equal(result.valid, true, `repo map should validate: ${JSON.stringify(result.errors)}`);

const files = new Map(map.files.map((file) => [file.path, file.classification]));
assert.equal(files.get("README.md"), "documentation");
assert.equal(files.get("package.json"), "config");
assert.equal(files.get("src/index.js"), "product_code");
assert.equal(files.get("tests/index.test.js"), "test");
assert.equal(files.get("vendor/lib.js"), "vendored");
assert.equal(files.get("generated/client.js"), "generated");
assert.equal(files.get("assets/logo.png"), "asset");
assert.equal(files.get("migrations/001-init.sql"), "migration");
assert.equal(files.get("mystery.blob"), "unknown");
assert.equal(files.has("ignored.log"), false);
assert.equal(files.has("ignored-dir/ignored.txt"), false);
assert.equal(map.files.length, files.size, "inventory should not duplicate file records");
assert.ok(map.gaps.some((gap) => gap.summary.includes("mystery.blob")), "unknown files must be visible gaps");

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-inventory-"));
try {
  await cp(fixtureRoot, tempRoot, { recursive: true });
  const written = await writeRepoMap(tempRoot);
  const text = await readFile(written.outputPath, "utf8");
  const parsed = YAML.parse(text);
  assert.equal(parsed.files.length, map.files.length);
  assert.equal(parsed.files.some((file) => file.path === ".seal/map.yaml"), false, "generated .seal output must stay ignored");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Inventory passed for ignored files, classifications, unknown gaps, and .seal/map.yaml output.");
