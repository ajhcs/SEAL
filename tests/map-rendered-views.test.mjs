import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  "# SEAL Map",
  "## Component Map",
  "## Files By Component",
  "## Dependencies",
  "## Interfaces And Data Stores",
  "## Tests And Proof Links",
  "## Unknowns And Gaps",
  "src/index.js",
  "tests/index.test.js",
  "mystery.blob",
  "gap.unknown-file.mystery"
]) {
  assert.ok(markdown.includes(expectedText), `Markdown map view should include ${expectedText}`);
}

assert.ok(mermaid.startsWith("flowchart LR"), "Mermaid view should be a flowchart");
assert.ok(mermaid.includes('["Repository"]'), "Mermaid view should include component nodes");
assert.ok(mermaid.includes("gap_unknown_file_mystery"), "Mermaid view should include visible gap nodes");
assert.ok(mermaid.includes("-.->|\"gap\"|"), "Mermaid view should link gaps back to mapped owners");

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-map-views-"));
try {
  await cp(fixtureRoot, tempRoot, { recursive: true });
  await writeRepoMap(tempRoot);
  const written = await writeMapViews(tempRoot);
  const writtenMarkdown = await readFile(written.markdownPath, "utf8");
  const writtenMermaid = await readFile(written.mermaidPath, "utf8");
  assert.ok(writtenMarkdown.includes("## Unknowns And Gaps"));
  assert.ok(writtenMarkdown.includes("mystery.blob"));
  assert.ok(writtenMermaid.includes("flowchart LR"));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Map rendered views passed for Markdown sections, Mermaid graph, tests, and visible unknown gaps.");
