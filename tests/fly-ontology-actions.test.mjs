import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMinimalArtifactSet, stringifyArtifact } from "../src/artifacts/generate.mjs";
import { validateArtifact } from "../src/artifacts/schema-registry.mjs";
import { formatValidationReport, validateSealArtifacts } from "../src/validation/validate.mjs";

async function writeArtifactWorkspace(artifactSet) {
  const workspace = await mkdtemp(path.join(tmpdir(), "seal-fly-"));
  const sealRoot = path.join(workspace, ".seal");
  await mkdir(path.join(sealRoot, "impacts"), { recursive: true });
  await mkdir(path.join(sealRoot, "evidence"), { recursive: true });
  await mkdir(path.join(sealRoot, "fly"), { recursive: true });
  await writeFile(path.join(sealRoot, "ontology.yaml"), stringifyArtifact(artifactSet.ontology), "utf8");
  await writeFile(path.join(sealRoot, "map.yaml"), stringifyArtifact(artifactSet.map), "utf8");
  await writeFile(path.join(sealRoot, "impacts", `${artifactSet.impact.id}.yaml`), stringifyArtifact(artifactSet.impact), "utf8");
  await writeFile(path.join(sealRoot, "proof.yaml"), stringifyArtifact(artifactSet.proof), "utf8");
  await writeFile(path.join(sealRoot, "evidence", "index.yaml"), stringifyArtifact(artifactSet.evidenceIndex), "utf8");
  await writeFile(path.join(sealRoot, "debt.yaml"), stringifyArtifact(artifactSet.debt), "utf8");
  await writeFile(path.join(sealRoot, "fly", `${artifactSet.fly.id}.yaml`), stringifyArtifact(artifactSet.fly), "utf8");
  return workspace;
}

const generated = createMinimalArtifactSet();
assert.ok(generated.ontology.action_types.some((action) => action.id === "reload_canonical"));
assert.ok(generated.ontology.action_types.some((action) => action.id === "fly_record"));
assert.ok(generated.ontology.state_types.some((state) => state.id === "gap_state"));

const flyResult = await validateArtifact("fly", generated.fly);
assert.equal(flyResult.valid, true, `generated FLY should validate: ${JSON.stringify(flyResult.errors)}`);

const unknownActionFly = structuredClone(generated.fly);
unknownActionFly.actions[1].action_type = "invented_action";
const unknownActionResult = await validateArtifact("fly", unknownActionFly);
assert.equal(unknownActionResult.valid, false, "unknown FLY action type should fail");
assert.ok(unknownActionResult.semanticErrors.some((error) => error.code === "unknown_fly_action_type"));

const missingReloadFly = structuredClone(generated.fly);
missingReloadFly.actions = missingReloadFly.actions.slice(1);
const missingReloadResult = await validateArtifact("fly", missingReloadFly);
assert.equal(missingReloadResult.valid, false, "validation/reporting actions before reload should fail");
assert.ok(missingReloadResult.semanticErrors.some((error) => error.code === "missing_reload_before_action"));

const badTransitionFly = structuredClone(generated.fly);
badTransitionFly.state_transitions[0].state_type = "made_up_state";
badTransitionFly.state_transitions[0].action_ref = "action.missing";
const badTransitionResult = await validateArtifact("fly", badTransitionFly);
assert.equal(badTransitionResult.valid, false, "invalid FLY state transition should fail");
assert.ok(badTransitionResult.semanticErrors.some((error) => error.code === "unknown_fly_state_type"));
assert.ok(badTransitionResult.semanticErrors.some((error) => error.code === "unknown_fly_action_ref"));

const workspace = await writeArtifactWorkspace(generated);
try {
  const validation = await validateSealArtifacts(workspace);
  assert.equal(validation.valid, true, formatValidationReport(validation));
  assert.ok(
    validation.validated.some((artifact) => artifact.artifactType === "fly"),
    "repository validation should discover .seal/fly/FLY-*.yaml"
  );
} finally {
  await rm(workspace, { recursive: true, force: true });
}

const invalidWorkspaceSet = createMinimalArtifactSet();
invalidWorkspaceSet.fly.actions[1].action_type = "invented_action";
const invalidWorkspace = await writeArtifactWorkspace(invalidWorkspaceSet);
try {
  const validation = await validateSealArtifacts(invalidWorkspace);
  assert.equal(validation.valid, false, "full validation should report invalid FLY ontology actions");
  assert.ok(
    validation.diagnostics.some((diagnostic) =>
      diagnostic.artifactType === "fly" &&
      diagnostic.path === "/actions/1/action_type" &&
      diagnostic.actual === "invented_action"
    ),
    `expected FLY diagnostic: ${JSON.stringify(validation.diagnostics)}`
  );
} finally {
  await rm(invalidWorkspace, { recursive: true, force: true });
}

console.log("FLY ontology actions and state transitions validate with canonical reload ordering.");
