import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guidePath = path.join(root, "plugin", "docs", "example-workflows.md");
const guide = await readFile(guidePath, "utf8");

for (const expected of [
  "Plain Markdown Plan",
  "Gstack-Style Plan",
  "Existing Project",
  "What exists?",
  "What changes?",
  "What would prove it?",
  "What blocks launch?",
  "npm exec -- seal repo map",
  "npm exec -- seal plan ingest",
  "npm exec -- seal impact",
  "npm exec -- seal proof",
  "npm exec -- seal launch",
  "npm exec -- seal validate",
  ".seal/reports/gap-review.md",
  ".seal/reports/proof-gaps.md",
  ".seal/reports/launch-readiness.md",
  "gap.plan-gstack-import-review"
]) {
  assert.ok(guide.includes(expected), `example workflow guide should include ${expected}`);
}

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(
    result.status,
    0,
    `${script} should succeed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

async function assertFile(targetRoot, relativePath) {
  assert.equal((await stat(path.join(targetRoot, relativePath))).isFile(), true, `${relativePath} should exist`);
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "seal-example-docs-"));

try {
  const plainRoot = path.join(tempRoot, "plain");
  await cp(path.join(root, "tests", "fixtures", "markdown-plans", "sparse.md"), path.join(plainRoot, "sparse.md"), { recursive: true });
  run("src/cli/seal.mjs", ["plan", "ingest", path.join(plainRoot, "sparse.md")]);
  run("src/cli/seal.mjs", ["proof", plainRoot]);
  run("src/cli/seal.mjs", ["launch", plainRoot]);
  run("src/cli/seal.mjs", ["validate", plainRoot]);
  await assertFile(plainRoot, ".seal/reports/gap-review.md");
  await assertFile(plainRoot, ".seal/reports/proof-gaps.md");
  await assertFile(plainRoot, ".seal/reports/launch-readiness.md");

  const gstackRoot = path.join(tempRoot, "gstack");
  await cp(path.join(root, "tests", "fixtures", "markdown-plans", "gstack-style.md"), path.join(gstackRoot, "gstack-style.md"), { recursive: true });
  run("src/cli/seal.mjs", ["plan", "ingest", path.join(gstackRoot, "gstack-style.md")]);
  run("src/cli/seal.mjs", ["proof", gstackRoot]);
  run("src/cli/seal.mjs", ["launch", gstackRoot]);
  run("src/cli/seal.mjs", ["validate", gstackRoot]);
  const gstackGapReview = await readFile(path.join(gstackRoot, ".seal", "reports", "gap-review.md"), "utf8");
  assert.match(gstackGapReview, /gap\.plan-gstack-import-review/);

  const repoRoot = path.join(tempRoot, "repo-tiny");
  await cp(path.join(root, "tests", "fixtures", "repo-tiny"), repoRoot, { recursive: true });
  run("src/cli/seal.mjs", ["repo", "map", repoRoot]);
  run("src/cli/seal.mjs", ["impact", repoRoot, "src/index.js", "Assess the public entrypoint"]);
  run("src/cli/seal.mjs", ["proof", repoRoot]);
  run("src/cli/seal.mjs", ["launch", repoRoot]);
  run("src/cli/seal.mjs", ["validate", repoRoot]);
  await assertFile(repoRoot, ".seal/reports/launch-readiness.md");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Example workflow docs passed for plan, gstack-style plan, and repository paths.");
