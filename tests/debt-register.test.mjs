import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { validateArtifact } from "../src/artifacts/schema-registry.mjs";
import { invokeSeal } from "../src/invocation/invoke.mjs";
import { validateSealArtifacts } from "../src/validation/validate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "repo-inventory");
const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-debt-register-"));

function recordByType(debt, type) {
  return debt.records.filter((record) => record.type === type);
}

try {
  await cp(fixtureRoot, tempRoot, { recursive: true });
  await invokeSeal(tempRoot);

  const debt = YAML.parse(await readFile(path.join(tempRoot, ".seal", "debt.yaml"), "utf8"));
  const schemaResult = await validateArtifact("debt", debt);
  assert.equal(schemaResult.valid, true, `debt register should validate: ${JSON.stringify(schemaResult.errors)}`);

  const unknownFile = recordByType(debt, "unknown_file")
    .find((record) => record.file_refs?.includes("mystery.blob"));
  assert.ok(unknownFile, "unknown files should become visible debt records");
  assert.deepEqual(unknownFile.gap_refs, ["gap.unknown-file.mystery"]);
  assert.match(unknownFile.next_action, /Classify or intentionally exclude/);

  const missingProof = recordByType(debt, "missing_evidence")
    .find((record) => record.file_refs?.includes("src/worker.js"));
  assert.ok(missingProof, "product files without observed test proof should be debt");
  assert.deepEqual(missingProof.gap_refs, ["gap.file-proof.src-worker"]);

  const boundaryDebt = recordByType(debt, "missing_owner")
    .find((record) => record.gap_refs?.includes("gap.repo-component-boundaries"));
  assert.ok(boundaryDebt, "inferred component boundaries should remain visible until approved");
  assert.ok(boundaryDebt.component_refs.length > 0, "boundary debt should name affected components");

  const missingRequirements = recordByType(debt, "missing_requirement")
    .find((record) => record.gap_refs?.includes("gap.repo-business-requirements"));
  assert.ok(missingRequirements, "missing business authority should be tracked as visible debt");

  const unlinkedTest = recordByType(debt, "missing_test")
    .find((record) => record.test_refs?.includes("tests/orphan.test.js"));
  assert.ok(unlinkedTest, "orphan test files should become visible debt");
  assert.deepEqual(unlinkedTest.file_refs, ["tests/orphan.test.js"]);

  const validation = await validateSealArtifacts(tempRoot);
  assert.equal(validation.valid, true, `artifact set with debt register should validate: ${JSON.stringify(validation.diagnostics)}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Visible debt register records unknowns, proof gaps, boundaries, requirements, and unlinked tests.");
