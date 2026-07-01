import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMinimalArtifactSet, assertGeneratedArtifactsValid, stringifyArtifact } from "../src/artifacts/generate.mjs";
import { parseYamlArtifact, validateArtifact } from "../src/artifacts/schema-registry.mjs";
import { CONTRACT_SCHEMA_VERSION } from "../src/contracts/constants.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "plugin", "fixtures", "minimal", ".seal");

const fixtureFiles = {
  ontology: path.join(fixtureRoot, "ontology.yaml"),
  map: path.join(fixtureRoot, "map.yaml"),
  impact: path.join(fixtureRoot, "impacts", "IMPACT-fixture.yaml"),
  proof: path.join(fixtureRoot, "proof.yaml"),
  evidenceIndex: path.join(fixtureRoot, "evidence", "index.yaml")
};

for (const [artifactType, filePath] of Object.entries(fixtureFiles)) {
  const artifact = await parseYamlArtifact(filePath);
  const result = await validateArtifact(artifactType, artifact);
  assert.equal(result.valid, true, `${artifactType} fixture should validate: ${JSON.stringify(result.errors)}`);
}

const invalidMap = {
  schema_version: CONTRACT_SCHEMA_VERSION,
  sources: [],
  components: [],
  gaps: []
};
const invalidMapResult = await validateArtifact("map", invalidMap);
assert.equal(invalidMapResult.valid, false, "map without file coverage must fail validation");
assert.ok(invalidMapResult.errors.some((error) => error.message.includes("files")));

const invalidProof = {
  schema_version: CONTRACT_SCHEMA_VERSION,
  claims: [
    {
      id: "claim.invalid",
      statement: "This claim hides proof state.",
      source_refs: ["src.invalid"],
      evidence_refs: [],
      gap_refs: []
    }
  ],
  gaps: []
};
const invalidProofResult = await validateArtifact("proof", invalidProof);
assert.equal(invalidProofResult.valid, false, "claim with neither evidence nor gap must fail validation");

const generated = createMinimalArtifactSet();
await assertGeneratedArtifactsValid(generated);
assert.ok(generated.ontology.action_types.some((action) => action.id === "canonical_reload"));
assert.match(stringifyArtifact(generated.ontology), /ontology\.seal\.v1/);
assert.match(stringifyArtifact(generated.map), new RegExp(`schema_version: ${CONTRACT_SCHEMA_VERSION.replaceAll(".", "\\.")}`));

console.log("Schema validation passed for fixtures, failing cases, and generated artifacts.");
