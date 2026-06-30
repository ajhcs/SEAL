import assert from "node:assert/strict";
import { createMinimalArtifactSet } from "../src/artifacts/generate.mjs";
import { validateArtifact } from "../src/artifacts/schema-registry.mjs";
import {
  ARTIFACT_INDEX_SUMMARY_MAX,
  resolveArtifactRecordsById,
  resolveArtifactRecordsByImpactTarget,
  resolveArtifactRecordsByPath,
  resolveArtifactRecordsByRelation,
  validateArtifactIndex
} from "../src/artifacts/index.mjs";

const artifactSet = createMinimalArtifactSet();
const index = artifactSet.artifactIndex;
const schemaResult = await validateArtifact("artifactIndex", index);

assert.equal(schemaResult.valid, true, JSON.stringify(schemaResult.errors));
assert.equal(index.records.some((record) => Object.hasOwn(record, "record")), false);
assert.ok(index.generated_from.includes(".seal/index.yaml") === false);

assert.ok(resolveArtifactRecordsById(index, "cmp.generated").some((record) => record.kind === "component"));
assert.ok(resolveArtifactRecordsByPath(index, "README.md").some((record) => record.kind === "file"));
assert.ok(resolveArtifactRecordsByRelation(index, { type: "owns_file" }).some((record) => record.id === "cmp.generated"));
assert.ok(resolveArtifactRecordsByImpactTarget(index, "README.md").some((record) => record.artifact_type === "impact"));

let result = validateArtifactIndex(index, artifactSet);
assert.equal(result.valid, true, JSON.stringify(result.errors));

const staleSet = createMinimalArtifactSet();
staleSet.map.components[0].purpose = "Changed after the index was generated.";
result = validateArtifactIndex(index, staleSet);
assert.equal(result.valid, false);
assert.ok(result.errors.some((error) => error.code === "stale_record"));

const missingHash = structuredClone(index);
delete missingHash.records[0].hash;
result = validateArtifactIndex(missingHash, artifactSet);
assert.equal(result.valid, false);
assert.ok(result.errors.some((error) => error.code === "missing_hash"));

const oversizedSummary = structuredClone(index);
oversizedSummary.records[0].summary = "x".repeat(ARTIFACT_INDEX_SUMMARY_MAX + 1);
result = validateArtifactIndex(oversizedSummary, artifactSet);
assert.equal(result.valid, false);
assert.ok(result.errors.some((error) => error.code === "oversized_summary"));

const brokenRelation = structuredClone(index);
brokenRelation.relations[0].to = "missing.record";
result = validateArtifactIndex(brokenRelation, artifactSet);
assert.equal(result.valid, false);
assert.ok(result.errors.some((error) => error.code === "dangling_relation"));

console.log("Artifact index resolves canonical records and rejects stale or broken generated records.");
