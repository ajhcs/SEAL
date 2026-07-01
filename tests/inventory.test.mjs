import assert from "node:assert/strict";
import { mkdtemp, cp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { TRACE_RELATION_TYPES } from "../src/contracts/constants.mjs";
import { createRepoMap, writeRepoMap, validateRepoMap } from "../src/inventory/map-repo.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "repo-inventory");

const map = await createRepoMap(fixtureRoot);
const result = await validateRepoMap(map);
assert.equal(result.valid, true, `repo map should validate: ${JSON.stringify(result.errors)}`);
const secondMap = await createRepoMap(fixtureRoot);

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
assert.ok(map.files.every((file) => file.ontology_type === "file" && file.ontology_id), "files should be ontology-typed");
assert.ok(map.components.every((component) => component.ontology_type === "component" && component.ontology_id), "components should be ontology-typed");
assert.ok(map.gaps.every((gap) => gap.ontology_type === "gap" && gap.ontology_id), "visible gaps should be ontology-typed");
assert.ok(map.relationships.length > 0, "map generation should emit ontology relationship records");
assert.ok(
  map.relationships.every((relationship) =>
    relationship.ontology_type === "trace_relation" && TRACE_RELATION_TYPES.includes(relationship.type)
  ),
  "map relationships should use ontology-defined relationship types"
);
assert.deepEqual(
  map.files.map((file) => [file.path, file.ontology_id]).sort(),
  secondMap.files.map((file) => [file.path, file.ontology_id]).sort(),
  "ontology object ids should be stable across map runs"
);

const invalidClassifierMap = structuredClone(map);
invalidClassifierMap.files[0].classification = "surprise_binary";
const invalidClassifierResult = await validateRepoMap(invalidClassifierMap);
assert.equal(invalidClassifierResult.valid, false, "invalid file classifiers should fail map validation");
assert.ok(
  invalidClassifierResult.errors.some((error) => error.code === "unknown_map_file_classification"),
  `expected classifier diagnostic: ${JSON.stringify(invalidClassifierResult.errors)}`
);

const invalidRelationshipMap = structuredClone(map);
invalidRelationshipMap.relationships[0].type = "magically_contains";
const invalidRelationshipResult = await validateRepoMap(invalidRelationshipMap);
assert.equal(invalidRelationshipResult.valid, false, "invalid map relationships should fail validation");
assert.ok(
  invalidRelationshipResult.errors.some((error) => error.code === "unknown_map_relationship_type"),
  `expected relationship diagnostic: ${JSON.stringify(invalidRelationshipResult.errors)}`
);

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
