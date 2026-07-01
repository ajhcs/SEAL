import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import YAML from "yaml";

import { createMinimalArtifactSet, stringifyArtifact } from "../src/artifacts/generate.mjs";
import { bootstrapOntologyIfMissing } from "../src/ontology/bootstrap.mjs";
import { formatValidationReport, validateSealArtifacts } from "../src/validation/validate.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function writeLegacyWorkspace({ withOntology = false } = {}) {
  const workspace = await mkdtemp(path.join(tmpdir(), "seal-ontology-migration-"));
  const sealRoot = path.join(workspace, ".seal");
  const artifactSet = createMinimalArtifactSet({
    sourceId: "src.legacy-readme",
    componentId: "cmp.legacy-app"
  });
  artifactSet.map.legacy_runtime_owner = "unmapped legacy owner";

  await mkdir(path.join(sealRoot, "impacts"), { recursive: true });
  await mkdir(path.join(sealRoot, "evidence"), { recursive: true });
  await writeFile(path.join(workspace, "README.md"), "# Legacy workspace\n", "utf8");
  await writeFile(path.join(sealRoot, "map.yaml"), stringifyArtifact(artifactSet.map), "utf8");
  await writeFile(path.join(sealRoot, "impacts", `${artifactSet.impact.id}.yaml`), stringifyArtifact(artifactSet.impact), "utf8");
  await writeFile(path.join(sealRoot, "proof.yaml"), stringifyArtifact(artifactSet.proof), "utf8");
  await writeFile(path.join(sealRoot, "evidence", "index.yaml"), stringifyArtifact(artifactSet.evidenceIndex), "utf8");

  if (withOntology) {
    artifactSet.ontology.name = "Human edited ontology";
    artifactSet.ontology.purpose.summary = "A human-owned ontology must not be overwritten.";
    await writeFile(path.join(sealRoot, "ontology.yaml"), stringifyArtifact(artifactSet.ontology), "utf8");
  }

  return workspace;
}

const legacyWorkspace = await writeLegacyWorkspace();
try {
  const missingResult = await validateSealArtifacts(legacyWorkspace);
  assert.equal(missingResult.valid, false, "normal validation should not mutate missing ontology");
  const missingReport = formatValidationReport(missingResult);
  assert.match(missingReport, /--bootstrap-ontology/);
  assert.match(missingReport, /plugin\/docs\/migration-policy\.md/);

  const bootstrap = await bootstrapOntologyIfMissing(legacyWorkspace);
  assert.equal(bootstrap.created, true);
  await stat(bootstrap.outputPath);

  const ontology = YAML.parse(await readFile(bootstrap.outputPath, "utf8"));
  assert.deepEqual(ontology.source_refs, ["src.legacy-readme"]);
  assert.ok(ontology.migration.preserved_ids.components.includes("cmp.legacy-app"));
  assert.ok(ontology.migration.preserved_ids.files.includes("README.md"));
  assert.ok(ontology.migration.preserved_ids.claims.includes("claim.generated-readable"));
  assert.ok(ontology.migration.preserved_ids.evidence.includes("ev.generated-gap"));
  assert.ok(ontology.migration.preserved_ids.gaps.includes("gap.generated-proof-evidence"));
  assert.ok(
    ontology.migration.gaps.some((gap) => gap.id === "gap.ontology-migration.map-legacy-runtime-owner"),
    "unmapped legacy fields should be recorded as migration gaps"
  );

  const migratedResult = await validateSealArtifacts(legacyWorkspace);
  assert.equal(migratedResult.valid, true, formatValidationReport(migratedResult));
} finally {
  await rm(legacyWorkspace, { recursive: true, force: true });
}

const existingOntologyWorkspace = await writeLegacyWorkspace({ withOntology: true });
try {
  const ontologyPath = path.join(existingOntologyWorkspace, ".seal", "ontology.yaml");
  const before = await readFile(ontologyPath, "utf8");
  const bootstrap = await bootstrapOntologyIfMissing(existingOntologyWorkspace);
  const after = await readFile(ontologyPath, "utf8");
  assert.equal(bootstrap.created, false);
  assert.equal(after, before, "existing ontology must not be overwritten");
} finally {
  await rm(existingOntologyWorkspace, { recursive: true, force: true });
}

const cliWorkspace = await writeLegacyWorkspace();
try {
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(root, "src", "cli", "seal.mjs"),
    "validate",
    cliWorkspace,
    "--bootstrap-ontology"
  ], { cwd: root });
  assert.match(stdout, /bootstrapped ontology:/);
  assert.match(stdout, /SEAL validation passed/);
} finally {
  await rm(cliWorkspace, { recursive: true, force: true });
}

const fixturesRoot = path.join(root, "tests", "fixtures", "full-workflow");
const tempFixturesRoot = await mkdtemp(path.join(tmpdir(), "seal-ontology-fixtures-"));
try {
  await cp(fixturesRoot, tempFixturesRoot, { recursive: true });
  for (const fixtureName of ["pass", "fail"]) {
    const bootstrap = await bootstrapOntologyIfMissing(path.join(tempFixturesRoot, fixtureName));
    assert.equal(bootstrap.created, false, `${fixtureName} fixture already carries ontology.yaml`);
  }
} finally {
  await rm(tempFixturesRoot, { recursive: true, force: true });
}

console.log("Ontology migration bootstrap preserves legacy ids and keeps validation explicit.");
