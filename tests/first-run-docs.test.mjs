import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guidePath = path.join(root, "plugin", "docs", "first-run.md");
const guide = await readFile(guidePath, "utf8");

for (const expected of [
  "Use SEAL to map this repo and tell me what is unknown.",
  "What exists?",
  "What changes?",
  "What would prove it?",
  "What blocks launch?",
  "Start In Codex",
  "%USERPROFILE%\\.agents\\plugins\\marketplace.json",
  "./plugins/seal",
  "update_plugin_cachebuster.py plugin",
  "read_marketplace_name.py",
  "[plugins.\"seal@<marketplace-name>\"]",
  ".codex\\plugins\\cache\\personal\\seal\\$($manifest.version)",
  "Start a new Codex thread after enabling and refreshing the cache",
  "seal:seal-map",
  "codex plugin add seal@<marketplace-name>",
  "Do not run `codex plugin marketplace add` for the default personal marketplace",
  "read_marketplace_name.py --marketplace-path <path-to-marketplace.json>",
  "Start From Terminal",
  "What It Creates",
  "What Done Looks Like",
  "If SEAL Finds Unknowns",
  "Troubleshooting",
  "Clean First-Run Check",
  ".seal/map.yaml",
  ".seal/debt.yaml",
  ".seal/impacts/IMPACT-initial.yaml",
  ".seal/proof.yaml",
  ".seal/evidence/index.yaml",
  ".seal/reports/gap-review.md",
  ".seal/reports/proof-gaps.md",
  ".seal/reports/launch-readiness.md"
]) {
  assert.ok(guide.includes(expected), `first-run guide should include ${expected}`);
}

for (const expectedQuestion of [
  "Which plan, ticket, or document is the source of truth?",
  "Who can approve launch or accept a risk?",
  "Which changed file, component, or requirement should impact analysis start from?",
  "Is a missing test acceptable debt, or should it block launch?"
]) {
  assert.ok(guide.includes(expectedQuestion), `first-run guide should explain authority-gap question: ${expectedQuestion}`);
}

for (const command of [
  "node src/cli/seal-invoke.mjs <path>",
  "node src/cli/seal-impact.mjs <path> <target> [summary]",
  "node src/cli/seal-proof-report.mjs <path>",
  "node src/cli/seal-launch-report.mjs <path>",
  "node src/cli/seal-validate.mjs <path>",
  "npm run smoke:plugin"
]) {
  assert.ok(guide.includes(command), `first-run guide should document command: ${command}`);
}

assert.equal(
  /codex plugin marketplace add\s+%USERPROFILE%/.test(guide),
  false,
  "default personal marketplace flow must not tell users to add the implicit marketplace"
);
assert.equal(
  /hand-edit(?:ing)? marketplace|edit marketplace\.json by hand/i.test(guide),
  false,
  "local reinstall flow should use plugin-creator helpers instead of hand-editing marketplace files"
);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "seal-first-run-"));
const target = path.join(tempRoot, "repo-tiny");

try {
  await cp(path.join(root, "tests", "fixtures", "repo-tiny"), target, { recursive: true });

  for (const [script, ...args] of [
    ["src/cli/seal-invoke.mjs", target],
    ["src/cli/seal-impact.mjs", target, "src/index.js", "Check first-run impact"],
    ["src/cli/seal-proof-report.mjs", target],
    ["src/cli/seal-launch-report.mjs", target],
    ["src/cli/seal-validate.mjs", target]
  ]) {
    const result = spawnSync(process.execPath, [path.join(root, script), ...args], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(
      result.status,
      0,
      `${script} should succeed on clean first-run fixture\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  for (const generated of [
    ".seal/map.yaml",
    ".seal/debt.yaml",
    ".seal/impacts/IMPACT-initial.yaml",
    ".seal/proof.yaml",
    ".seal/evidence/index.yaml",
    ".seal/reports/gap-review.md",
    ".seal/reports/proof-gaps.md",
    ".seal/reports/launch-readiness.md"
  ]) {
    assert.equal((await stat(path.join(target, generated))).isFile(), true, `${generated} should be generated`);
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("First-run guide check passed.");
