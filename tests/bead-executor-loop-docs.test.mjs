import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guide = await readFile(path.join(root, "plugin", "docs", "bead-executor-verify-loop.md"), "utf8");
const readme = await readFile(path.join(root, "README.md"), "utf8");

for (const expected of [
  "bd onboard",
  "git pull --rebase --autostash",
  "bd info --json",
  "bd dep cycles",
  "bd ready",
  "bd update <bead-id> --status in_progress",
  "npm test",
  "npm run test:closure",
  "npm run closure:enforce",
  "npm run smoke:plugin",
  ".seal/closure/<bead-id>.yaml",
  "criteria_coverage",
  "bd close <bead-id>",
  "git push",
  "git status -sb",
  "seal-product-guided-layer",
  "seal-skill-quality-audit",
  "seal-rigor-profiles",
  "seal-human-dashboard",
  "seal-mermaid-navigation",
  "seal-publish-remote"
]) {
  assert.ok(guide.includes(expected), `bead executor loop should include ${expected}`);
}

for (const expectedSection of [
  "Operating Rules",
  "Preflight",
  "Pick And Claim",
  "Execute",
  "Verify Loop",
  "Closure Evidence",
  "Close And Land",
  "Stop Conditions"
]) {
  assert.ok(guide.includes(`## ${expectedSection}`), `bead executor loop should include ${expectedSection}`);
}

assert.ok(
  guide.includes("Do not close `seal-product-guided-layer` directly"),
  "executor loop should prevent premature epic closeout"
);
assert.ok(
  guide.includes("Every acceptance criterion has at least one validation command"),
  "executor loop should require acceptance-to-command mapping"
);
assert.ok(
  guide.includes("Every acceptance criterion has at least one evidence path"),
  "executor loop should require acceptance-to-evidence mapping"
);
assert.ok(
  readme.includes("plugin/docs/bead-executor-verify-loop.md"),
  "README should link the bead executor loop"
);

console.log("Bead executor loop docs check passed.");
