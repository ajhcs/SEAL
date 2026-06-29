import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-rc-command-surface-"));
const sealCli = path.join(repoRoot, "src", "cli", "seal.mjs");

async function runSeal(args) {
  return execFileAsync(process.execPath, [sealCli, ...args], {
    cwd: repoRoot,
    windowsHide: true
  });
}

try {
  const repoCase = path.join(tempRoot, "repo-tiny");
  await cp(path.join(repoRoot, "tests", "fixtures", "repo-tiny"), repoCase, { recursive: true });

  await runSeal(["repo", "map", repoCase]);
  await stat(path.join(repoCase, ".seal", "map.yaml"));
  await stat(path.join(repoCase, ".seal", "reports", "map.md"));
  await stat(path.join(repoCase, ".seal", "reports", "map.mmd"));

  await runSeal(["impact", repoCase, "src/index.js", "Assess the public entrypoint"]);
  const impactFiles = await readdir(path.join(repoCase, ".seal", "impacts"));
  assert.ok(impactFiles.some((file) => /^IMPACT-.+\.yaml$/.test(file)));

  await runSeal(["proof", repoCase]);
  await stat(path.join(repoCase, ".seal", "reports", "proof-gaps.md"));

  await runSeal(["launch", repoCase]);
  await stat(path.join(repoCase, ".seal", "reports", "launch-readiness.md"));

  const validation = await runSeal(["validate", repoCase]);
  assert.match(validation.stdout, /SEAL validation passed/);

  const planCase = path.join(tempRoot, "plan-case");
  await cp(path.join(repoRoot, "tests", "fixtures", "markdown-plans"), planCase, { recursive: true });
  const planPath = path.join(planCase, "rc-plan.md");
  await writeFile(planPath, "# RC plan\n\n## Goals\n\n- Validate the short command surface.\n", "utf8");

  await runSeal(["plan", "ingest", planPath]);
  await stat(path.join(planCase, ".seal", "map.yaml"));
  await stat(path.join(planCase, ".seal", "proof.yaml"));
  await stat(path.join(planCase, ".seal", "evidence", "index.yaml"));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("RC command surface supports repo map, plan ingest, impact, proof, launch, and validate.");
