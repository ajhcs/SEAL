import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";
import { createMinimalArtifactSet } from "../src/artifacts/generate.mjs";
import { invokeSeal } from "../src/invocation/invoke.mjs";

function assertStarterGuidance(record, label) {
  assert.ok(
    record.plain_language || record.next_step || record.purpose,
    `${label} should include beginner-safe guidance`
  );
}

const generated = createMinimalArtifactSet();
assertStarterGuidance(generated.ontology.purpose, "generated ontology purpose");
assertStarterGuidance(generated.map.components[0], "generated map component");
assertStarterGuidance(generated.map.files[0], "generated map file");
assertStarterGuidance(generated.impact.change, "generated impact change");
assertStarterGuidance(generated.impact.proof_required[0], "generated impact proof requirement");
assertStarterGuidance(generated.proof.claims[0], "generated proof claim");
assertStarterGuidance(generated.evidenceIndex.evidence[0], "generated evidence item");
assert.ok(
  generated.proof.claims[0].gap_refs.length > 0,
  "starter proof should expose a gap instead of pretending evidence exists"
);

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-templates-"));

try {
  const planPath = path.join(tempRoot, "one-page-plan.md");
  await writeFile(planPath, "# One page plan\n\nBuild the smallest safe launch path.\n", "utf8");
  await invokeSeal(planPath);

  for (const relativePath of [
    ".seal/ontology.yaml",
    ".seal/map.yaml",
    ".seal/impacts/IMPACT-initial.yaml",
    ".seal/proof.yaml",
    ".seal/evidence/index.yaml"
  ]) {
    await stat(path.join(tempRoot, relativePath));
  }

  const map = YAML.parse(await readFile(path.join(tempRoot, ".seal", "map.yaml"), "utf8"));
  const ontology = YAML.parse(await readFile(path.join(tempRoot, ".seal", "ontology.yaml"), "utf8"));
  const impact = YAML.parse(
    await readFile(path.join(tempRoot, ".seal", "impacts", "IMPACT-initial.yaml"), "utf8")
  );
  const proof = YAML.parse(await readFile(path.join(tempRoot, ".seal", "proof.yaml"), "utf8"));
  const evidenceIndex = YAML.parse(
    await readFile(path.join(tempRoot, ".seal", "evidence", "index.yaml"), "utf8")
  );

  assertStarterGuidance(ontology.purpose, "plan ontology purpose");
  assertStarterGuidance(map.sources[0], "plan source");
  assertStarterGuidance(map.components[0], "plan component");
  assertStarterGuidance(map.gaps[0], "plan gap");
  assertStarterGuidance(impact.change, "plan impact change");
  assertStarterGuidance(impact.proof_required[0], "plan proof requirement");
  assertStarterGuidance(proof.claims[0], "plan proof claim");
  assertStarterGuidance(evidenceIndex.evidence[0], "plan evidence");
  assert.equal(evidenceIndex.evidence[0].status, "incomplete", "starter evidence should not overstate proof");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Starter artifact templates passed for complete files, plain guidance, and visible proof gaps.");
