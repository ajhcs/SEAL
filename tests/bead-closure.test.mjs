import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function criterionCoverage({ criterion = "Evidence proves acceptance.", command = "node tests/guide-workflow.test.mjs", evidencePath = "tests/guide-workflow.test.mjs" } = {}) {
  return [
    {
      acceptance_criterion: criterion,
      validation_commands: [command],
      evidence_paths: [evidencePath]
    }
  ];
}

async function writeIssues(root, issues) {
  await mkdir(path.join(root, ".beads"), { recursive: true });
  await writeFile(path.join(root, ".beads", "issues.jsonl"), `${issues.map(JSON.stringify).join("\n")}\n`, "utf8");
}

async function writeEvidence(root, id, evidence) {
  await mkdir(path.join(root, ".seal", "closure"), { recursive: true });
  await writeFile(path.join(root, ".seal", "closure", `${id}.yaml`), stringifyArtifact(evidence), "utf8");
}

async function writeBdStub(root) {
  const binDir = path.join(root, "bin");
  await mkdir(binDir, { recursive: true });
  if (process.platform === "win32") {
    const bdPath = path.join(binDir, "bd.cmd");
    await writeFile(bdPath, "@echo off\r\necho %*>> \"%BD_REOPEN_LOG%\"\r\nexit /b 0\r\n", "utf8");
    return bdPath;
  } else {
    const bdPath = path.join(binDir, "bd");
    await writeFile(bdPath, "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$BD_REOPEN_LOG\"\n", "utf8");
    await chmod(bdPath, 0o755);
    return bdPath;
  }
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
    criteria_coverage: criterionCoverage({ evidencePath: "tests/guide-workflow.test.mjs" }),
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
    criteria_coverage: criterionCoverage(),
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
    criteria_coverage: criterionCoverage(),
    proof_result: "passed"
  });
  result = await validateBeadClosureEvidence({
    rootPath: tempRoot,
    beadIds: ["seal-guide-preserve-canonical-artifacts"]
  });
  assert.equal(result.valid, true);

  const cliOk = await execFileAsync(process.execPath, [closureCli, "--root", tempRoot, "--bead", "seal-guide-preserve-canonical-artifacts"]);
  assert.match(cliOk.stdout, /Closure evidence valid for 1 bead/);

  await writeEvidence(tempRoot, "seal-guide-preserve-canonical-artifacts", {
    bead_id: "seal-guide-preserve-canonical-artifacts",
    acceptance_criteria: ["Guide reruns preserve canonical artifacts."],
    implementation_summary: "Missing coverage should fail even when paths exist.",
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
  assert.ok(result.errors.some((error) => error.code === "missing_criteria_coverage"));

  await writeEvidence(tempRoot, "seal-guide-preserve-canonical-artifacts", {
    bead_id: "seal-guide-preserve-canonical-artifacts",
    acceptance_criteria: ["Guide reruns preserve canonical artifacts."],
    implementation_summary: "Unknown command references should fail coverage.",
    changed_source_paths: ["src/guide/workflow.mjs"],
    changed_test_paths: ["tests/guide-workflow.test.mjs"],
    validation_commands: ["node tests/guide-workflow.test.mjs"],
    criteria_coverage: criterionCoverage({ command: "npm test" }),
    proof_result: "passed"
  });
  result = await validateBeadClosureEvidence({
    rootPath: tempRoot,
    beadIds: ["seal-guide-preserve-canonical-artifacts"]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "unknown_criterion_validation_command"));

  await writeEvidence(tempRoot, "seal-guide-preserve-canonical-artifacts", {
    bead_id: "seal-guide-preserve-canonical-artifacts",
    acceptance_criteria: ["Guide reruns preserve canonical artifacts."],
    implementation_summary: "Nonexistent evidence paths should fail coverage.",
    changed_source_paths: ["src/guide/workflow.mjs"],
    changed_test_paths: ["tests/guide-workflow.test.mjs"],
    validation_commands: ["node tests/guide-workflow.test.mjs"],
    criteria_coverage: criterionCoverage({ evidencePath: "tests/missing.test.mjs" }),
    proof_result: "passed"
  });
  result = await validateBeadClosureEvidence({
    rootPath: tempRoot,
    beadIds: ["seal-guide-preserve-canonical-artifacts"]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "missing_criterion_evidence_path"));

  await writeEvidence(tempRoot, "seal-guide-preserve-canonical-artifacts", {
    bead_id: "seal-guide-preserve-canonical-artifacts",
    acceptance_criteria: ["Guide reruns preserve canonical artifacts."],
    implementation_summary: "Mismatched criterion text should fail coverage.",
    changed_source_paths: ["src/guide/workflow.mjs"],
    changed_test_paths: ["tests/guide-workflow.test.mjs"],
    validation_commands: ["node tests/guide-workflow.test.mjs"],
    criteria_coverage: criterionCoverage({ criterion: "Almost the right criterion." }),
    proof_result: "passed"
  });
  result = await validateBeadClosureEvidence({
    rootPath: tempRoot,
    beadIds: ["seal-guide-preserve-canonical-artifacts"]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "criterion_coverage_mismatch"));
  assert.ok(result.errors.some((error) => error.code === "uncovered_acceptance_criterion"));

  await writeEvidence(tempRoot, "seal-guide-preserve-canonical-artifacts", {
    bead_id: "seal-guide-preserve-canonical-artifacts",
    acceptance_criteria: ["Guide reruns preserve canonical artifacts."],
    implementation_summary: "Restore valid evidence before CLI enforcement checks.",
    changed_source_paths: ["src/guide/workflow.mjs"],
    changed_test_paths: ["tests/guide-workflow.test.mjs"],
    validation_commands: ["node tests/guide-workflow.test.mjs"],
    criteria_coverage: criterionCoverage(),
    proof_result: "passed"
  });

  await writeIssues(tempRoot, [
    closedIssue("seal-guide-preserve-canonical-artifacts"),
    closedIssue("seal-artifact-index"),
    { ...closedIssue("seal-open-followup"), status: "open" }
  ]);
  const bdPath = await writeBdStub(tempRoot);
  const bdBin = path.dirname(bdPath);
  const reopenLog = path.join(tempRoot, "reopened.log");
  const cliEnv = {
    ...process.env,
    PATH: `${bdBin}${path.delimiter}${process.env.PATH}`,
    Path: `${bdBin}${path.delimiter}${process.env.Path ?? process.env.PATH}`,
    SEAL_BD_BIN: bdPath,
    BD_REOPEN_LOG: reopenLog
  };
  await assert.rejects(
    () => execFileAsync(process.execPath, [closureCli, "--root", tempRoot, "--all-closed-p0-p1"], { env: cliEnv }),
    (error) => error.code === 1 && error.stderr.includes("missing_evidence")
  );
  await assert.rejects(
    () => readFile(reopenLog, "utf8"),
    (error) => error.code === "ENOENT"
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [closureCli, "--root", tempRoot, "--all-closed-p0-p1", "--reopen-failed"], { env: cliEnv }),
    (error) => error.code === 1 && error.stderr.includes("reopened: seal-artifact-index")
  );
  const reopenedLog = await readFile(reopenLog, "utf8");
  assert.match(reopenedLog, /reopen seal-artifact-index --reason Closure evidence failed: missing_evidence/);
  assert.doesNotMatch(reopenedLog, /seal-guide-preserve-canonical-artifacts/);
  assert.doesNotMatch(reopenedLog, /seal-open-followup/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Bead closure evidence validation rejects trust-only closure and missing proof paths.");
