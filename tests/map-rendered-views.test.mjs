import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GENERATED_VIEW_NOTICE } from "../src/contracts/constants.mjs";
import { createRepoMap, writeRepoMap } from "../src/inventory/map-repo.mjs";
import { createMapViews, writeMapViews } from "../src/map/render-views.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "repo-inventory");

const map = await createRepoMap(fixtureRoot);
const { markdown, mermaid, summary } = createMapViews(map);

assert.equal(summary.components > 0, true);
assert.equal(summary.files, map.files.length);
assert.equal(summary.gaps, map.gaps.length);

for (const expectedText of [
  "# SEAL Repo Map",
  GENERATED_VIEW_NOTICE,
  "## Observed Reality",
  "## Approved Architecture",
  "## Files By Component",
  "## Dependencies",
  "## Services And Cost",
  "## Interfaces",
  "## Data Stores",
  "## Tests",
  "## Unknowns And Drift",
  "src/index.js",
  "tests/index.test.js",
  "mystery.blob",
  "gap.unknown-file.mystery"
]) {
  assert.ok(markdown.includes(expectedText), `Markdown map view should include ${expectedText}`);
}

assert.ok(mermaid.includes(GENERATED_VIEW_NOTICE), "Mermaid view should be marked generated");
assert.ok(mermaid.includes("flowchart LR"), "Mermaid view should be a flowchart");
assert.ok(mermaid.includes('cmp_repo["cmp.repo"]'), "Mermaid view should include component nodes");

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-map-views-"));
try {
  await cp(fixtureRoot, tempRoot, { recursive: true });
  await writeRepoMap(tempRoot);
  const written = await writeMapViews(tempRoot);
  const writtenMarkdown = await readFile(written.repoMapPath, "utf8");
  const writtenMermaid = await readFile(written.systemMapPath, "utf8");
  assert.ok(writtenMarkdown.includes("## Unknowns And Drift"));
  assert.ok(writtenMarkdown.includes("mystery.blob"));
  assert.ok(writtenMermaid.includes("flowchart LR"));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Map rendered views passed for Markdown sections, Mermaid graph, tests, and visible unknown gaps.");
