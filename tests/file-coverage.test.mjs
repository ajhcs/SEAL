import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { stringifyArtifact } from "../src/artifacts/generate.mjs";
import { createDebtRegisterFromMap } from "../src/debt/register.mjs";
import { invokeSeal } from "../src/invocation/invoke.mjs";
import { createRepoMap } from "../src/inventory/map-repo.mjs";
import { validateFileCoverage } from "../src/validation/file-coverage.mjs";
import { formatValidationReport, validateSealArtifacts } from "../src/validation/validate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "repo-inventory");

async function copyFixture() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-coverage-"));
  await cp(fixtureRoot, tempRoot, { recursive: true });
  return tempRoot;
}

function clone(value) {
  return structuredClone(value);
}

function assertCoverageError(result, code) {
  assert.equal(result.valid, false, `coverage should fail with ${code}`);
  assert.ok(
    result.errors.some((error) => error.code === code),
    `expected coverage error ${code}: ${JSON.stringify(result.errors)}`
  );
}

const coverageRoot = await copyFixture();
try {
  const map = await createRepoMap(coverageRoot);
  const debt = createDebtRegisterFromMap(map);

  const validCoverage = await validateFileCoverage(coverageRoot, { map, debt });
  assert.equal(validCoverage.valid, true, JSON.stringify(validCoverage.errors));
  assert.ok(validCoverage.summary.mapped > 0, "mapped file count should be reported");
  assert.ok(validCoverage.summary.generated > 0, "generated file count should be reported");
  assert.ok(validCoverage.summary.vendored > 0, "vendored file count should be reported");
  assert.ok(validCoverage.summary.unknown > 0, "unknown file count should be reported");

  const missingMap = clone(map);
  missingMap.files = missingMap.files.filter((file) => file.path !== "src/index.js");
  assertCoverageError(await validateFileCoverage(coverageRoot, { map: missingMap, debt }), "unmapped_file");

  const uncoveredMap = clone(map);
  const readme = uncoveredMap.files.find((file) => file.path === "README.md");
  delete readme.component_id;
  readme.gap_refs = [];
  assertCoverageError(await validateFileCoverage(coverageRoot, { map: uncoveredMap, debt }), "uncovered_file");

  const staleMap = clone(map);
  staleMap.files.push({
    path: "src/missing.js",
    classification: "product_code",
    component_id: "repo",
    source_refs: ["src.repo-inventory"],
    authority_state: "repo_observed",
    approval_state: "pending",
    confidence: 0.8
  });
  assertCoverageError(await validateFileCoverage(coverageRoot, { map: staleMap, debt }), "stale_file_ref");

  const orphanMap = clone(map);
  orphanMap.components.push({
    id: "cmp.orphan",
    name: "Orphan component",
    source_refs: ["src.repo-inventory"],
    authority_state: "repo_observed",
    approval_state: "pending",
    confidence: 0.3
  });
  assertCoverageError(await validateFileCoverage(coverageRoot, { map: orphanMap, debt }), "orphan_component");
} finally {
  await rm(coverageRoot, { recursive: true, force: true });
}

const validationRoot = await copyFixture();
try {
  await invokeSeal(validationRoot);
  const mapPath = path.join(validationRoot, ".seal", "map.yaml");
  const map = YAML.parse(await readFile(mapPath, "utf8"));
  map.files = map.files.filter((file) => file.path !== "src/index.js");
  await writeFile(mapPath, stringifyArtifact(map), "utf8");

  const validation = await validateSealArtifacts(validationRoot);
  assert.equal(validation.valid, false, "repo validation should fail when a file is absent from the map");
  assert.ok(
    validation.diagnostics.some((diagnostic) => diagnostic.artifactType === "coverage" && diagnostic.actual === "missing from map files"),
    `expected coverage diagnostic: ${JSON.stringify(validation.diagnostics)}`
  );
  assert.match(formatValidationReport(validation), /coverage|src\/index\.js|map\.yaml/);
} finally {
  await rm(validationRoot, { recursive: true, force: true });
}

console.log("File coverage validation catches invisible repository files and unmapped ownership.");
