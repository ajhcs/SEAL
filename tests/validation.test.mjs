import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createMinimalArtifactSet, stringifyArtifact } from "../src/artifacts/generate.mjs";
import { CURRENT_ARTIFACT_SCHEMA_VERSION } from "../src/artifacts/versions.mjs";
import { formatValidationReport, validateSealArtifacts } from "../src/validation/validate.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validFixture = path.join(root, "plugin", "fixtures", "minimal");
const invalidFixture = path.join(root, "tests", "fixtures", "invalid-seal");

const validResult = await validateSealArtifacts(validFixture);
assert.equal(validResult.valid, true, formatValidationReport(validResult));
assert.equal(validResult.validated.length, 5, "minimal fixture should validate all five required artifact types");

async function writeArtifactWorkspace(artifactSet) {
  const workspace = await mkdtemp(path.join(tmpdir(), "seal-artifacts-"));
  const sealRoot = path.join(workspace, ".seal");
  await mkdir(path.join(sealRoot, "impacts"), { recursive: true });
  await mkdir(path.join(sealRoot, "evidence"), { recursive: true });
  await writeFile(path.join(sealRoot, "ontology.yaml"), stringifyArtifact(artifactSet.ontology), "utf8");
  await writeFile(path.join(sealRoot, "map.yaml"), stringifyArtifact(artifactSet.map), "utf8");
  await writeFile(path.join(sealRoot, "impacts", `${artifactSet.impact.id}.yaml`), stringifyArtifact(artifactSet.impact), "utf8");
  await writeFile(path.join(sealRoot, "proof.yaml"), stringifyArtifact(artifactSet.proof), "utf8");
  await writeFile(path.join(sealRoot, "evidence", "index.yaml"), stringifyArtifact(artifactSet.evidenceIndex), "utf8");
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

async function assertProofBindingFailure(artifactSet, expectedCode, expectedPathPattern) {
  const workspace = await writeArtifactWorkspace(artifactSet);
  try {
    const result = await validateSealArtifacts(workspace);
    assert.equal(result.valid, false, `artifact set should fail ${expectedCode} proof binding validation`);
    assert.ok(
      result.diagnostics.some((diagnostic) => diagnostic.artifactType === "proof_binding" && diagnostic.code === expectedCode),
      `expected proof binding diagnostic ${expectedCode}: ${JSON.stringify(result.diagnostics)}`
    );
    const report = formatValidationReport(result);
    assert.match(report, expectedPathPattern);
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

const invalidOntologySet = createMinimalArtifactSet();
invalidOntologySet.ontology.command_bindings[0].actions = ["unregistered_action"];
const invalidOntologyWorkspace = await writeArtifactWorkspace(invalidOntologySet);
try {
  const invalidOntologyResult = await validateSealArtifacts(invalidOntologyWorkspace);
  assert.equal(invalidOntologyResult.valid, false, "unknown ontology action references should fail validation");
  assert.ok(
    invalidOntologyResult.diagnostics.some((diagnostic) =>
      diagnostic.artifactType === "ontology" &&
      diagnostic.path === "/command_bindings/0/actions/0" &&
      diagnostic.actual === "unregistered_action"
    ),
    `expected ontology semantic diagnostic: ${JSON.stringify(invalidOntologyResult.diagnostics)}`
  );
} finally {
  await rm(invalidOntologyWorkspace, { recursive: true, force: true });
}

const missingObjectRefsSet = createMinimalArtifactSet();
delete missingObjectRefsSet.proof.claims[0].object_refs;
await assertProofBindingFailure(missingObjectRefsSet, "missing_bound_object", /path: \/proof\/claims\/0\/object_refs/);

const unknownObjectRefsSet = createMinimalArtifactSet();
unknownObjectRefsSet.proof.claims[0].object_refs = ["cmp.missing"];
await assertProofBindingFailure(unknownObjectRefsSet, "unknown_bound_object", /path: \/proof\/claims\/0\/object_refs\/0/);

function makeGeneratedClaimProven(artifactSet, { evidenceStatus = "passed", gapRefs = [] } = {}) {
  artifactSet.proof.claims[0].status = "proven";
  artifactSet.proof.claims[0].freshness = {
    status: "current",
    checked_at: "2026-01-01T00:00:00.000Z",
    basis: "Validation evidence was refreshed."
  };
  artifactSet.proof.claims[0].gap_refs = gapRefs;
  artifactSet.proof.evidence[0].type = "test_result";
  artifactSet.proof.evidence[0].result = evidenceStatus;
  artifactSet.evidenceIndex.evidence[0].type = "test_result";
  artifactSet.evidenceIndex.evidence[0].status = evidenceStatus;
}

const staleEvidenceSet = createMinimalArtifactSet();
makeGeneratedClaimProven(staleEvidenceSet, { evidenceStatus: "stale" });
await assertProofBindingFailure(staleEvidenceSet, "stale_proof_evidence", /path: \/proof\/claims\/0\/evidence_refs\/0/);

const failedEvidenceSet = createMinimalArtifactSet();
makeGeneratedClaimProven(failedEvidenceSet, { evidenceStatus: "failed" });
await assertProofBindingFailure(failedEvidenceSet, "failed_proof_evidence", /path: \/proof\/claims\/0\/evidence_refs\/0/);

const openGapSet = createMinimalArtifactSet();
makeGeneratedClaimProven(openGapSet, { gapRefs: ["gap.generated-proof-evidence"] });
await assertProofBindingFailure(openGapSet, "unresolved_blocking_gap", /path: \/proof\/claims\/0\/gap_refs\/0/);

const acceptedGapSet = createMinimalArtifactSet();
acceptedGapSet.proof.gaps[0].status = "accepted";
const acceptedGapWorkspace = await writeArtifactWorkspace(acceptedGapSet);
try {
  const acceptedGapResult = await validateSealArtifacts(acceptedGapWorkspace);
  assert.equal(acceptedGapResult.valid, true, formatValidationReport(acceptedGapResult));
} finally {
  await rm(acceptedGapWorkspace, { recursive: true, force: true });
}

const humanApprovalSet = createMinimalArtifactSet();
makeGeneratedClaimProven(humanApprovalSet);
humanApprovalSet.proof.evidence[0].type = "human_approval";
humanApprovalSet.proof.evidence[0].authority_state = "human_approved";
humanApprovalSet.proof.evidence[0].approval_state = "approved";
humanApprovalSet.proof.evidence[0].source = {
  kind: "human_review",
  summary: "A human approved the launch proof claim."
};
humanApprovalSet.evidenceIndex.evidence[0].type = "human_approval";
humanApprovalSet.evidenceIndex.evidence[0].authority_state = "human_approved";
humanApprovalSet.evidenceIndex.evidence[0].approval_state = "approved";
humanApprovalSet.evidenceIndex.evidence[0].source = humanApprovalSet.proof.evidence[0].source;
const humanApprovalWorkspace = await writeArtifactWorkspace(humanApprovalSet);
try {
  const humanApprovalResult = await validateSealArtifacts(humanApprovalWorkspace);
  assert.equal(humanApprovalResult.valid, true, formatValidationReport(humanApprovalResult));
} finally {
  await rm(humanApprovalWorkspace, { recursive: true, force: true });
}

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
