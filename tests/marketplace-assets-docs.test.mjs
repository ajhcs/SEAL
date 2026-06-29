import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = await readFile(path.join(root, "plugin", "docs", "marketplace-assets.md"), "utf8");

for (const expected of [
  "plugin/docs/first-run.md",
  "Short description:",
  "MAP repo truth",
  "IMPACT proposed changes",
  "PROVE claims",
  "A repository path",
  "A Markdown plan",
  "A gstack-style Markdown plan",
  ".seal/map.yaml",
  ".seal/impacts/IMPACT-*.yaml",
  ".seal/proof.yaml",
  ".seal/evidence/index.yaml",
  ".seal/reports/gap-review.md",
  ".seal/reports/launch-readiness.md",
  ".seal/reports/context-pack.json",
  "npm run smoke:plugin",
  "node src/cli/seal-invoke.mjs tests/fixtures/markdown-plans/gstack-style.md",
  "node src/cli/seal-launch-report.mjs tests/fixtures/full-workflow/pass",
  "node src/cli/seal-validate.mjs plugin/fixtures/minimal",
  "Support Path",
  "bd",
  "seal-publish-remote"
]) {
  assert.ok(doc.includes(expected), `marketplace assets should include ${expected}`);
}

for (const forbidden of [
  "ChatGPT App availability.",
  "Marketplace installation.",
  "Remote publishing.",
  "Replacement of human approval"
]) {
  assert.ok(doc.includes(`- ${forbidden}`), `marketplace assets should explicitly forbid claiming ${forbidden}`);
}

assert.match(
  doc,
  /must not be used as ChatGPT App or marketplace submission proof until a supported adapter exists/,
  "marketplace assets should not imply ChatGPT App or marketplace availability"
);

console.log("Marketplace launch assets docs passed.");
