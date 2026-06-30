import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDebtRegisterFromMap } from "../src/debt/register.mjs";
import { writeIngestionGapReview } from "../src/ingestion/gap-review.mjs";
import { createRepoMap } from "../src/inventory/map-repo.mjs";
import { invokeSeal } from "../src/invocation/invoke.mjs";

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-gap-review-"));

try {
  const planDir = await mkdtemp(path.join(tempRoot, "plan-"));
  const planPath = path.join(planDir, "thin-plan.md");
  await writeFile(planPath, "", "utf8");

  const planResult = await invokeSeal(planPath);
  await stat(planResult.written.gapReview);
  const planReview = await readFile(planResult.written.gapReview, "utf8");
  assert.match(planReview, /# SEAL Ingestion Gap Review/);
  assert.match(planReview, /gap\.plan-no-requirements/);
  assert.match(planReview, /gap\.plan-no-launch-gates/);
assert.match(planReview, /claim\.generated-readable/);
  assert.match(planReview, /high impact \/ high confidence/);
assert.match(planReview, /Sources: src\.plan-thin-plan/);

  const repoDir = await mkdtemp(path.join(tempRoot, "repo-"));
  await mkdir(path.join(repoDir, "src"), { recursive: true });
  await writeFile(path.join(repoDir, "package.json"), "{\"type\":\"module\"}\n", "utf8");
  await writeFile(
    path.join(repoDir, "src", "index.js"),
    "import './missing.js';\nexport function run() { return true; }\n",
    "utf8"
  );

  const map = await createRepoMap(repoDir, {
    sourceId: "src.repo-test",
    componentId: "cmp.repo-test"
  });
  const debt = createDebtRegisterFromMap(map);
  const { review, outputPath } = await writeIngestionGapReview(repoDir, { map, debt });
  await stat(outputPath);
  const repoReview = await readFile(outputPath, "utf8");

  assert.ok(review.items.some((item) => item.title.includes("Business requirements were not recovered")));
  assert.ok(review.items.some((item) => item.title.includes("Proof claims or evidence index are not available")));
  assert.match(repoReview, /## Unclear Interfaces/);
  assert.match(repoReview, /src\/index\.js imports unresolved dependency \.\/missing\.js/);
  assert.match(repoReview, /src\.repo-test/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Ingestion gap review passed for thin plan gaps and repo inventory debt.");
