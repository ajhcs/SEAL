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

const invalidOntologyCases = [
  {
    label: "unknown entity type",
    mutate: (ontology) => { ontology.entity_types[0].id = "bogus_entity"; },
    expected: "unknown_entity_type"
  },
  {
    label: "unknown relationship type",
    mutate: (ontology) => { ontology.relationship_types[0].id = "bogus_relationship"; },
    expected: "unknown_relationship_type"
  },
  {
    label: "unknown action type",
    mutate: (ontology) => { ontology.action_types[0].id = "bogus_action"; },
    expected: "unknown_action_type"
  },
  {
    label: "unknown state type",
    mutate: (ontology) => { ontology.state_types[0].id = "bogus_state"; },
    expected: "unknown_state_type"
  },
  {
    label: "duplicate registry id",
    mutate: (ontology) => { ontology.entity_types.push({ ...ontology.entity_types[0] }); },
    expected: "duplicate_id"
  },
  {
    label: "missing required registry section",
    mutate: (ontology) => { delete ontology.entity_types; },
    expected: "required"
  },
  {
    label: "malformed version metadata",
    mutate: (ontology) => { ontology.schema_version = "v1"; },
    expected: "pattern"
  }
];

for (const { label, mutate, expected } of invalidOntologyCases) {
  const ontology = structuredClone(generated.ontology);
  mutate(ontology);
  const result = await validateArtifact("ontology", ontology);
  assert.equal(result.valid, false, `ontology should fail for ${label}`);
  assert.ok(
    result.errors.some((error) => `${error.code ?? ""} ${error.schemaPath ?? ""} ${error.message}`.includes(expected)),
    `ontology ${label} should include ${expected}: ${JSON.stringify(result.errors)}`
  );
}

console.log("Schema validation passed for fixtures, failing cases, and generated artifacts.");
