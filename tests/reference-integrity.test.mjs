import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMinimalArtifactSet, assertGeneratedArtifactsValid } from "../src/artifacts/generate.mjs";
import { validateArtifactReferences } from "../src/artifacts/reference-integrity.mjs";
import { parseYamlArtifact } from "../src/artifacts/schema-registry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "plugin", "fixtures", "minimal", ".seal");

const fixtureSet = {
  map: await parseYamlArtifact(path.join(fixtureRoot, "map.yaml")),
  impact: await parseYamlArtifact(path.join(fixtureRoot, "impacts", "IMPACT-fixture.yaml")),
  proof: await parseYamlArtifact(path.join(fixtureRoot, "proof.yaml")),
  evidenceIndex: await parseYamlArtifact(path.join(fixtureRoot, "evidence", "index.yaml"))
};

const fixtureResult = validateArtifactReferences(fixtureSet);
assert.equal(fixtureResult.valid, true, `fixture references should validate: ${JSON.stringify(fixtureResult.errors)}`);

const validSet = await assertGeneratedArtifactsValid(createMinimalArtifactSet());
const validResult = validateArtifactReferences(validSet);
assert.equal(validResult.valid, true, `generated artifact references should validate: ${JSON.stringify(validResult.errors)}`);

const duplicateSet = createMinimalArtifactSet();
duplicateSet.proof.claims[0].id = duplicateSet.map.components[0].id;
const duplicateResult = validateArtifactReferences(duplicateSet);
assert.equal(duplicateResult.valid, false, "duplicate IDs must fail reference validation");
assert.ok(duplicateResult.errors.some((error) => error.code === "duplicate_id" && error.message.includes("cmp.generated")));

const danglingSet = createMinimalArtifactSet();
danglingSet.map.files[0].component_id = "cmp.missing";
const danglingResult = validateArtifactReferences(danglingSet);
assert.equal(danglingResult.valid, false, "dangling references must fail reference validation");
assert.ok(danglingResult.errors.some((error) => error.code === "dangling_ref" && error.path.endsWith("/component_id")));

const invalidLinkTypeSet = createMinimalArtifactSet();
invalidLinkTypeSet.impact.affected.components[0] = {
  kind: "service",
  id: "affected.invalid-service",
  ref: invalidLinkTypeSet.map.components[0].id,
  summary: "Services do not have a P0 artifact owner yet.",
  source_refs: ["src.generated"]
};
const invalidLinkTypeResult = validateArtifactReferences(invalidLinkTypeSet);
assert.equal(invalidLinkTypeResult.valid, false, "unsupported typed links must fail reference validation");
assert.ok(invalidLinkTypeResult.errors.some((error) => error.code === "invalid_link_type"));

console.log("Reference integrity passed for duplicates, dangling refs, invalid link types, and generated artifacts.");
