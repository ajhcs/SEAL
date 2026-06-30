import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { invokeSeal } from "../src/invocation/invoke.mjs";
import { listInventoryFiles } from "../src/inventory/walk.mjs";
import { validateSealArtifacts } from "../src/validation/validate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function invokeFixture(fixtureName) {
  const fixtureRoot = path.join(root, "tests", "fixtures", fixtureName);
  const tempRoot = await mkdtemp(path.join(tmpdir(), `seal-${fixtureName}-`));
  await cp(fixtureRoot, tempRoot, { recursive: true });
  await invokeSeal(tempRoot);
  return tempRoot;
}

async function readArtifact(tempRoot, relativePath) {
  return YAML.parse(await readFile(path.join(tempRoot, relativePath), "utf8"));
}

async function assertEveryObservedFileMapped(tempRoot, map) {
  const observedFiles = await listInventoryFiles(tempRoot);
  const mappedFiles = new Set(map.files.map((file) => file.path));
  for (const filePath of observedFiles) {
    assert.equal(mappedFiles.has(filePath), true, `${filePath} should be represented in map files`);
  }
}

const tinyRoot = await invokeFixture("repo-tiny");
try {
  const map = await readArtifact(tinyRoot, ".seal/map.yaml");
  const impact = await readArtifact(tinyRoot, ".seal/impacts/IMPACT-initial.yaml");
  const proof = await readArtifact(tinyRoot, ".seal/proof.yaml");
  const evidence = await readArtifact(tinyRoot, ".seal/evidence/index.yaml");

  await assertEveryObservedFileMapped(tinyRoot, map);
  assert.ok(map.components[0].entrypoints.includes("src/index.js"), "tiny app entrypoint should be identified");
  assert.ok(map.components[0].modules.some((module) => module.name === "src"), "src module should be summarized");
  const tinySrc = map.components.find((component) => component.id.endsWith(".src"));
  assert.ok(tinySrc, "src component should be inferred from repo evidence");
  assert.ok(tinySrc.source_files.includes("src/index.js"), "src component should own source files");
  assert.ok(tinySrc.tests.includes("src/index.test.js"), "src component should list observed tests");
  assert.ok(
    tinySrc.interface_details.some((item) => item.kind === "export" && item.file === "src/index.js"),
    "exports should be visible interfaces",
  );
  assert.ok(
    tinySrc.dependency_details.some((item) => item.path === "src/index.js"),
    "test import should be an observed file dependency",
  );
  const tinyIndex = map.files.find((file) => file.path === "src/index.js");
  assert.equal(tinyIndex.component_id, tinySrc.id);
  assert.equal(tinyIndex.proof_status, "test_link_observed");
  assert.deepEqual(tinyIndex.tests, ["src/index.test.js"]);
  assert.ok(map.components[0].validation_plan.some((step) => step.id === "validate.repo-proof-links"));
  assert.ok(map.gaps.some((gap) => gap.id === "gap.repo-business-requirements"));
  assert.ok(map.gaps.some((gap) => gap.id === "gap.repo-test-proof-links"));
  assert.ok(impact.proof_required.some((need) => need.claim_id === "claim.generated-readable"));
  assert.ok(proof.claims.some((claim) => claim.id === "claim.generated-readable"));
  assert.equal(evidence.evidence[0].status, "incomplete");

  const validation = await validateSealArtifacts(tinyRoot);
  assert.equal(validation.valid, true, `tiny repo artifacts should validate: ${JSON.stringify(validation.diagnostics)}`);
} finally {
  await rm(tinyRoot, { recursive: true, force: true });
}

const multiRoot = await invokeFixture("repo-inventory");
try {
  const map = await readArtifact(multiRoot, ".seal/map.yaml");
  const proof = await readArtifact(multiRoot, ".seal/proof.yaml");

  await assertEveryObservedFileMapped(multiRoot, map);
  assert.ok(map.gaps.some((gap) => gap.summary.includes("mystery.blob")), "unknown file should be a visible gap");
  const multiSrc = map.components.find((component) => component.id.endsWith(".src"));
  assert.ok(multiSrc.source_files.includes("src/index.js"), "multi fixture source component should own source file");
  assert.ok(multiSrc.source_files.includes("src/worker.js"), "multi fixture source component should own additional source files");
  const multiIndex = map.files.find((file) => file.path === "src/index.js");
  assert.equal(multiIndex.proof_status, "test_link_observed");
  assert.deepEqual(multiIndex.tests, ["tests/index.test.js"]);
  const multiWorker = map.files.find((file) => file.path === "src/worker.js");
  assert.equal(multiWorker.proof_status, "proof_gap");
  assert.ok(multiWorker.gap_refs.includes("gap.file-proof.src-worker"), "unlinked product code should get a file proof gap");
  assert.ok(map.gaps.some((gap) => gap.id === "gap.file-proof.src-worker"));
  assert.equal(map.files.some((file) => file.path === "ignored.log"), false, "ignored files must stay out of the map");
  assert.equal(map.files.some((file) => file.path === ".seal/map.yaml"), false, "generated SEAL artifacts must stay out of repo inventory");
  assert.ok(map.components[0].validation_plan.some((step) => step.id === "validate.repo-unknown-review"));
  assert.ok(proof.claims
    .find((claim) => claim.id === "claim.generated-readable")
    .gap_refs.includes("gap.generated-proof-evidence"));

  const validation = await validateSealArtifacts(multiRoot);
  assert.equal(validation.valid, true, `multi-directory repo artifacts should validate: ${JSON.stringify(validation.diagnostics)}`);
} finally {
  await rm(multiRoot, { recursive: true, force: true });
}

console.log("Existing project ingestion passed for tiny and multi-directory fixtures.");
