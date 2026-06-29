import assert from "node:assert/strict";
import { validatePluginManifest, loadPluginManifest } from "../src/plugin/manifest.mjs";
import packageJson from "../package.json" with { type: "json" };

const result = await validatePluginManifest();
assert.deepEqual(result.errors, []);
assert.equal(result.valid, true, "plugin manifest should be schema-valid and reference real files");

const manifest = await loadPluginManifest();
assert.equal(manifest.distribution.kind, "codex-plugin");
assert.equal(manifest.distribution.chatgptAppSubmission, false);
assert.equal(manifest.entrypoints.skills[0].path, "skills/seal/SKILL.md");
assert.deepEqual(
  manifest.entrypoints.commands.map((command) => command.packageBin),
  Object.keys(packageJson.bin)
);

const driftedManifest = structuredClone(manifest);
driftedManifest.version = "9.9.9";
const driftResult = await validatePluginManifest(driftedManifest);
assert.equal(driftResult.valid, false);
assert.ok(
  driftResult.errors.some((error) => error.path === "/version"),
  "version drift from package.json should fail validation"
);

const stalePathManifest = structuredClone(manifest);
stalePathManifest.docs[0].path = "docs/missing.md";
const stalePathResult = await validatePluginManifest(stalePathManifest);
assert.equal(stalePathResult.valid, false);
assert.ok(
  stalePathResult.errors.some((error) => error.message.includes("docs/missing.md")),
  "stale manifest paths should fail validation"
);

const hiddenCommandManifest = structuredClone(manifest);
hiddenCommandManifest.entrypoints.commands = hiddenCommandManifest.entrypoints.commands.filter(
  (command) => command.packageBin !== "seal-context-pack"
);
const hiddenCommandResult = await validatePluginManifest(hiddenCommandManifest);
assert.equal(hiddenCommandResult.valid, false);
assert.ok(
  hiddenCommandResult.errors.some((error) => error.message.includes("must expose package.json bin seal-context-pack")),
  "all package bins should be discoverable through the plugin manifest"
);

console.log("Plugin manifest validation passed.");
