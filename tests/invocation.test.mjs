import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";
import { ARTIFACT_WRITE_POLICIES, invokeSeal } from "../src/invocation/invoke.mjs";

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-invoke-"));

try {
  const actualPlanDir = await mkdtemp(path.join(tempRoot, "plan-case-"));
  const planPath = path.join(actualPlanDir, "launch-plan.md");
  await writeFile(planPath, "# Product plan\n\n## Goals\n\n- Ship the initial product safely.\n", "utf8");

  const planResult = await invokeSeal(planPath);
  assert.equal(planResult.targetKind, "plan");
  for (const filePath of Object.values(planResult.written).filter((value) => typeof value === "string")) {
    await stat(filePath);
  }
  assert.equal(
    path.relative(actualPlanDir, planResult.written.artifactIndex).replaceAll(path.sep, "/"),
    ".seal/index.yaml"
  );
  assert.equal(planResult.written.writeActions.map.action, "created");

  const planMap = YAML.parse(await readFile(path.join(actualPlanDir, ".seal", "map.yaml"), "utf8"));
  assert.equal(planMap.sources[0].kind, "human_input");
  assert.equal(planMap.files[0].path, "launch-plan.md");
  assert.ok(planMap.requirements.some((requirement) => requirement.summary === "Ship the initial product safely."));
  assert.ok(planMap.gaps.some((gap) => gap.id === "gap.plan-human-review"));

  const actualRepoDir = await mkdtemp(path.join(tempRoot, "repo-case-"));
  await writeFile(path.join(actualRepoDir, "README.md"), "# Repo\n", "utf8");
  await writeFile(path.join(actualRepoDir, "package.json"), "{\"type\":\"module\"}\n", "utf8");

  const repoResult = await invokeSeal(actualRepoDir);
  assert.equal(repoResult.targetKind, "repo");
  await stat(repoResult.written.artifactIndex);
  const repoMap = YAML.parse(await readFile(path.join(actualRepoDir, ".seal", "map.yaml"), "utf8"));
  assert.equal(repoMap.sources[0].kind, "repo_observation");
  assert.ok(repoMap.files.some((file) => file.path === "README.md"));
  assert.ok(repoMap.files.some((file) => file.path === "package.json"));

  const humanMapPath = path.join(actualRepoDir, ".seal", "map.yaml");
  const humanMap = `${await readFile(humanMapPath, "utf8")}\n# operator note: preserve canonical map\n`;
  await writeFile(humanMapPath, humanMap, "utf8");

  const createMissingAgain = await invokeSeal(actualRepoDir, { writePolicy: ARTIFACT_WRITE_POLICIES.CREATE_MISSING });
  assert.equal(createMissingAgain.written.writeActions.map.action, "preserved");
  assert.equal(await readFile(humanMapPath, "utf8"), humanMap);

  await assert.rejects(
    () => invokeSeal(actualRepoDir, { writePolicy: ARTIFACT_WRITE_POLICIES.STRICT_INIT }),
    /strict-init refuses to overwrite canonical artifacts/
  );

  const replaced = await invokeSeal(actualRepoDir, { writePolicy: ARTIFACT_WRITE_POLICIES.REPLACE_WITH_BACKUP });
  assert.equal(replaced.written.writeActions.map.action, "replaced_with_backup");
  assert.ok(replaced.written.writeActions.map.backupPath);
  await stat(replaced.written.writeActions.map.backupPath);
  assert.notEqual(await readFile(humanMapPath, "utf8"), humanMap);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Invocation passed for plan and repo targets with valid starter artifacts.");
