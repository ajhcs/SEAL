import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createMinimalArtifactSet, stringifyArtifact } from "../src/artifacts/generate.mjs";
import { createArtifactIndex } from "../src/artifacts/index.mjs";
import { CURRENT_ARTIFACT_SCHEMA_VERSION } from "../src/artifacts/versions.mjs";
import { formatValidationReport, validateSealArtifacts } from "../src/validation/validate.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validFixture = path.join(root, "plugin", "fixtures", "minimal");
const invalidFixture = path.join(root, "tests", "fixtures", "invalid-seal");

const validResult = await validateSealArtifacts(validFixture);
assert.equal(validResult.valid, true, formatValidationReport(validResult));
assert.equal(validResult.validated.length, 4, "minimal fixture should validate all four artifact types");

async function writeArtifactWorkspace(artifactSet, { writeIndex = false } = {}) {
  const workspace = await mkdtemp(path.join(tmpdir(), "seal-artifacts-"));
  const sealRoot = path.join(workspace, ".seal");
  await mkdir(path.join(sealRoot, "impacts"), { recursive: true });
  await mkdir(path.join(sealRoot, "evidence"), { recursive: true });
  await writeFile(path.join(workspace, "README.md"), "# fixture\n", "utf8");
  await writeFile(path.join(sealRoot, "map.yaml"), stringifyArtifact(artifactSet.map), "utf8");
  await writeFile(path.join(sealRoot, "impacts", `${artifactSet.impact.id}.yaml`), stringifyArtifact(artifactSet.impact), "utf8");
  await writeFile(path.join(sealRoot, "proof.yaml"), stringifyArtifact(artifactSet.proof), "utf8");
  await writeFile(path.join(sealRoot, "evidence", "index.yaml"), stringifyArtifact(artifactSet.evidenceIndex), "utf8");
  if (writeIndex && artifactSet.artifactIndex) {
    await writeFile(path.join(sealRoot, "index.yaml"), stringifyArtifact(artifactSet.artifactIndex), "utf8");
  }
  return workspace;
}

async function assertReferenceFailure(artifactSet, expectedCode, expectedPathPattern) {
  const workspace = await writeArtifactWorkspace(artifactSet);
  try {
    const result = await validateSealArtifacts(workspace);
    assert.equal(result.valid, false, `artifact set should fail ${expectedCode} validation`);
    assert.ok(
      result.diagnostics.some((diagnostic) => diagnostic.artifactType === "reference" && diagnostic.actual === expectedCode),
      `expected reference diagnostic ${expectedCode}: ${JSON.stringify(result.diagnostics)}`
    );
    const report = formatValidationReport(result);
    assert.match(report, expectedPathPattern);
    assert.match(report, /artifactType|expected|fix/);
    return report;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

const duplicateSet = createMinimalArtifactSet();
duplicateSet.proof.claims[0].id = duplicateSet.map.components[0].id;
await assertReferenceFailure(duplicateSet, "duplicate_id", /path: \/proof\/claims\/0\/id/);

const danglingSet = createMinimalArtifactSet();
danglingSet.map.files[0].component_id = "cmp.missing";
await assertReferenceFailure(danglingSet, "dangling_ref", /path: \/map\/files\/0\/component_id/);

const invalidLinkTypeSet = createMinimalArtifactSet();
invalidLinkTypeSet.impact.affected.components[0] = {
  kind: "service",
  id: "affected.invalid-service",
  ref: invalidLinkTypeSet.map.components[0].id,
  summary: "Service targets are not part of the P0 artifact model.",
  source_refs: ["src.generated"]
};
await assertReferenceFailure(invalidLinkTypeSet, "invalid_link_type", /path: \/impacts\/0\/affected\/components\/0\/kind/);

const invalidResult = await validateSealArtifacts(invalidFixture);
assert.equal(invalidResult.valid, false, "malformed fixture should fail validation");
const invalidReport = formatValidationReport(invalidResult);
assert.match(invalidReport, /SEAL validation failed/);
assert.match(invalidReport, /map\.yaml/);
assert.match(invalidReport, /path: \/files/);
assert.match(invalidReport, /expected: required property "files"/);
assert.match(invalidReport, /actual: missing/);
assert.match(invalidReport, /fix: Add "files"/);
assert.match(invalidReport, /expected: one of:/);
assert.match(invalidReport, /fix: Add "evidence"/);
assert.match(invalidReport, /fix: Add "counterevidence_refs"/);
assert.match(invalidReport, /fix: Add "limitations"/);
assert.match(invalidReport, /fix: Add "freshness"/);

const oldVersionSet = createMinimalArtifactSet();
oldVersionSet.map.schema_version = "0.0.0";
const oldVersionWorkspace = await writeArtifactWorkspace(oldVersionSet);
try {
  const oldVersionResult = await validateSealArtifacts(oldVersionWorkspace);
  assert.equal(oldVersionResult.valid, false, "older schema_version should block validation");
  assert.ok(
    oldVersionResult.diagnostics.some((diagnostic) =>
      diagnostic.artifactType === "map" &&
      diagnostic.path === "/schema_version" &&
      diagnostic.actual === "0.0.0" &&
      diagnostic.fix.includes("plugin/docs/migration-policy.md")
    ),
    `expected schema_version migration diagnostic: ${JSON.stringify(oldVersionResult.diagnostics)}`
  );
  const oldVersionReport = formatValidationReport(oldVersionResult);
  assert.match(
    oldVersionReport,
    new RegExp(`schema_version 0\\.0\\.0 is older than supported ${CURRENT_ARTIFACT_SCHEMA_VERSION.replaceAll(".", "\\.")}`)
  );
} finally {
  await rm(oldVersionWorkspace, { recursive: true, force: true });
}

const futureVersionSet = createMinimalArtifactSet();
futureVersionSet.proof.schema_version = "9.0.0";
const futureVersionWorkspace = await writeArtifactWorkspace(futureVersionSet);
try {
  const futureVersionResult = await validateSealArtifacts(futureVersionWorkspace);
  assert.equal(futureVersionResult.valid, false, "future schema_version should block validation");
  const futureVersionReport = formatValidationReport(futureVersionResult);
  assert.match(futureVersionReport, /schema_version 9\.0\.0 is newer than this SEAL build supports/);
  assert.match(futureVersionReport, /Upgrade SEAL before editing this artifact/);
} finally {
  await rm(futureVersionWorkspace, { recursive: true, force: true });
}

const staleIndexSet = createMinimalArtifactSet();
staleIndexSet.artifactIndex = createArtifactIndex({
  map: staleIndexSet.map,
  impact: staleIndexSet.impact,
  proof: staleIndexSet.proof,
  evidenceIndex: staleIndexSet.evidenceIndex
});
staleIndexSet.map.components[0].purpose = "Changed after index generation.";
const staleIndexWorkspace = await writeArtifactWorkspace(staleIndexSet, { writeIndex: true });
try {
  const staleIndexResult = await validateSealArtifacts(staleIndexWorkspace);
  assert.equal(staleIndexResult.valid, false, "stale artifact index should block validation");
  assert.ok(
    staleIndexResult.diagnostics.some((diagnostic) =>
      diagnostic.artifactType === "artifactIndex" &&
      diagnostic.actual === "stale_record"
    ),
    `expected artifact index stale_record diagnostic: ${JSON.stringify(staleIndexResult.diagnostics)}`
  );
  const staleIndexReport = formatValidationReport(staleIndexResult);
  assert.match(staleIndexReport, /\.seal\/index\.yaml/);
  assert.match(staleIndexReport, /Regenerate \.seal\/index\.yaml/);
} finally {
  await rm(staleIndexWorkspace, { recursive: true, force: true });
}

try {
  await execFileAsync(process.execPath, [path.join(root, "src", "cli", "seal-validate.mjs"), invalidFixture], {
    cwd: root
  });
  assert.fail("seal-validate CLI should exit non-zero for malformed artifacts");
} catch (error) {
  assert.equal(error.code, 1);
  assert.match(error.stdout, /SEAL validation failed/);
  assert.match(error.stdout, /expected:/);
  assert.match(error.stdout, /actual:/);
  assert.match(error.stdout, /fix:/);
}

const emptyWorkspace = await mkdtemp(path.join(tmpdir(), "seal-empty-"));
try {
  const emptyResult = await validateSealArtifacts(emptyWorkspace);
  assert.equal(emptyResult.valid, false, "missing required artifacts should fail validation");
  assert.ok(emptyResult.diagnostics.some((diagnostic) => diagnostic.path === "/" && diagnostic.actual === "missing"));
} finally {
  await rm(emptyWorkspace, { recursive: true, force: true });
}

console.log("SEAL validation command reports actionable errors for invalid artifacts.");
