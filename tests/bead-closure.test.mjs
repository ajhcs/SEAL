import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { stringifyArtifact } from "../src/artifacts/generate.mjs";
import { validateBeadClosureEvidence } from "../src/beads/closure-evidence.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const closureCli = path.join(repoRoot, "src", "cli", "seal-closure-evidence.mjs");

function closedIssue(id, priority = 0) {
  return {
    id,
    status: "closed",
    priority,
    acceptance_criteria: ["Evidence proves acceptance."],
    description: "Acceptance criteria: evidence must exist."
  };
}

async function writeIssues(root, issues) {
  await mkdir(path.join(root, ".beads"), { recursive: true });
  await writeFile(path.join(root, ".beads", "issues.jsonl"), `${issues.map(JSON.stringify).join("\n")}\n`, "utf8");
}

async function writeEvidence(root, id, evidence) {
  await mkdir(path.join(root, ".seal", "closure"), { recursive: true });
  await writeFile(path.join(root, ".seal", "closure", `${id}.yaml`), stringifyArtifact(evidence), "utf8");
}

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-bead-closure-"));

try {
  await writeIssues(tempRoot, [
    closedIssue("seal-guide-preserve-canonical-artifacts"),
    closedIssue("seal-artifact-index"),
    closedIssue("seal-bead-closure-evidence-gate", 1)
  ]);

  let result = await validateBeadClosureEvidence({
    rootPath: tempRoot,
    beadIds: ["seal-guide-preserve-canonical-artifacts"]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "missing_evidence"));

  await assert.rejects(
    () => execFileAsync(process.execPath, [closureCli, "--root", tempRoot, "--bead", "seal-guide-preserve-canonical-artifacts"]),
    (error) => error.code === 1 && error.stderr.includes("missing_evidence")
  );

  await writeEvidence(tempRoot, "seal-guide-preserve-canonical-artifacts", {
    bead_id: "seal-guide-preserve-canonical-artifacts",
    acceptance_criteria: ["Guide reruns preserve canonical artifacts."],
    implementation_summary: "Policy added but fixture references missing files.",
    changed_source_paths: ["src/guide/workflow.mjs"],
    changed_test_paths: ["tests/guide-workflow.test.mjs"],
    validation_commands: ["node tests/guide-workflow.test.mjs"],
    proof_result: "passed"
  });
  result = await validateBeadClosureEvidence({
    rootPath: tempRoot,
    beadIds: ["seal-guide-preserve-canonical-artifacts"]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "missing_changed_source_path"));
  assert.ok(result.errors.some((error) => error.code === "missing_changed_test_path"));

  result = await validateBeadClosureEvidence({
    rootPath: tempRoot,
    beadIds: ["seal-artifact-index"]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "missing_evidence"));

  await mkdir(path.join(tempRoot, "src", "guide"), { recursive: true });
  await mkdir(path.join(tempRoot, "tests"), { recursive: true });
  await writeFile(path.join(tempRoot, "src", "guide", "workflow.mjs"), "export {};\n", "utf8");
  await writeFile(path.join(tempRoot, "tests", "guide-workflow.test.mjs"), "import 'node:assert/strict';\n", "utf8");

  await writeEvidence(tempRoot, "seal-guide-preserve-canonical-artifacts", {
    bead_id: "seal-guide-preserve-canonical-artifacts",
    acceptance_criteria: ["Guide reruns preserve canonical artifacts."],
    implementation_summary: "Failed proof result should not satisfy closure.",
    changed_source_paths: ["src/guide/workflow.mjs"],
    changed_test_paths: ["tests/guide-workflow.test.mjs"],
    validation_commands: ["node tests/guide-workflow.test.mjs"],
    proof_result: "failed"
  });
  result = await validateBeadClosureEvidence({
    rootPath: tempRoot,
    beadIds: ["seal-guide-preserve-canonical-artifacts"]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "proof_not_passed"));

  await writeEvidence(tempRoot, "seal-guide-preserve-canonical-artifacts", {
    bead_id: "seal-guide-preserve-canonical-artifacts",
    acceptance_criteria: ["Guide reruns preserve canonical artifacts."],
    implementation_summary: "Guide reruns preserve canonical artifacts and regenerate derived views from disk authority.",
    changed_source_paths: ["src/guide/workflow.mjs"],
    changed_test_paths: ["tests/guide-workflow.test.mjs"],
    validation_commands: ["node tests/guide-workflow.test.mjs"],
    proof_result: "passed"
  });
  result = await validateBeadClosureEvidence({
    rootPath: tempRoot,
    beadIds: ["seal-guide-preserve-canonical-artifacts"]
  });
  assert.equal(result.valid, true);

  const cliOk = await execFileAsync(process.execPath, [closureCli, "--root", tempRoot, "--bead", "seal-guide-preserve-canonical-artifacts"]);
  assert.match(cliOk.stdout, /Closure evidence valid for 1 bead/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Bead closure evidence validation rejects trust-only closure and missing proof paths.");
