import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checklist = await readFile(path.join(root, "plugin", "docs", "release-checklist.md"), "utf8");

for (const expected of [
  "npm test",
  "npm run test:closure",
  "npm run smoke:plugin",
  "bd dep cycles",
  "bd sync",
  "git pull --rebase",
  "git push",
  "seal-publish-remote",
  "plugin/docs/example-workflows.md",
  "plugin/manifest.json",
  "Release Notes Template",
  "Known gaps",
  "up to date with origin"
]) {
  assert.ok(checklist.includes(expected), `release checklist should include ${expected}`);
}

for (const expectedSection of [
  "Version And Scope",
  "Required Local Gates",
  "Manual Confidence Checks",
  "Bead Closeout",
  "Git Landing"
]) {
  assert.ok(checklist.includes(`## ${expectedSection}`), `release checklist should include ${expectedSection}`);
}

console.log("Release checklist docs check passed.");
