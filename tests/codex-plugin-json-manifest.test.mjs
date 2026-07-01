import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };
import { validateCodexPluginIngestion } from "../src/plugin/codex-validator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(root, "plugin");

async function readCodexManifest(pluginPath = pluginRoot) {
  return JSON.parse(await readFile(path.join(pluginPath, ".codex-plugin", "plugin.json"), "utf8"));
}

async function writeCodexManifest(pluginPath, manifest) {
  await writeFile(path.join(pluginPath, ".codex-plugin", "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function validatePlugin(pluginPath) {
  return validateCodexPluginIngestion(pluginPath, { cwd: root, useBuiltin: true });
}

async function assertValidatorFailure(label, mutate, expectedPattern) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-plugin-manifest-"));
  const tempPlugin = path.join(tempRoot, "plugin");
  try {
    await cp(pluginRoot, tempPlugin, { recursive: true });
    await mutate(tempPlugin);
    await assert.rejects(
      validatePlugin(tempPlugin),
      (error) => {
        assert.match(error.message, expectedPattern, label);
        return true;
      },
      label
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const manifest = await readCodexManifest();
await validatePlugin(pluginRoot);

assert.equal(manifest.name, "seal");
assert.equal(manifest.version, packageJson.version);
assert.equal(manifest.skills, "./skills/");
assert.equal("hooks" in manifest, false);
assert.equal("mcpServers" in manifest, false);
assert.equal("apps" in manifest, false);
assert.equal(JSON.stringify(manifest).includes("[TODO:"), false);

await assertValidatorFailure(
  "missing plugin.json should fail validation",
  async (pluginPath) => {
    await rm(path.join(pluginPath, ".codex-plugin", "plugin.json"));
  },
  /missing `.codex-plugin\/plugin\.json`/
);

await assertValidatorFailure(
  "unsupported hooks field should fail validation",
  async (pluginPath) => {
    const candidate = await readCodexManifest(pluginPath);
    candidate.hooks = "./hooks.json";
    await writeCodexManifest(pluginPath, candidate);
  },
  /hooks|Additional properties/
);

await assertValidatorFailure(
  "invalid semver should fail validation",
  async (pluginPath) => {
    const candidate = await readCodexManifest(pluginPath);
    candidate.version = "v1";
    await writeCodexManifest(pluginPath, candidate);
  },
  /version|semver|pattern/
);

await assertValidatorFailure(
  "missing interface defaults should fail validation",
  async (pluginPath) => {
    const candidate = await readCodexManifest(pluginPath);
    delete candidate.interface.shortDescription;
    await writeCodexManifest(pluginPath, candidate);
  },
  /shortDescription/
);

await assertValidatorFailure(
  "declared missing mcp companion should fail validation",
  async (pluginPath) => {
    const candidate = await readCodexManifest(pluginPath);
    candidate.mcpServers = "./.mcp.json";
    await writeCodexManifest(pluginPath, candidate);
  },
  /\.mcp\.json|mcpServers/
);

await assertValidatorFailure(
  "TODO placeholders should fail validation",
  async (pluginPath) => {
    const candidate = await readCodexManifest(pluginPath);
    candidate.description = "[TODO: describe plugin]";
    await writeCodexManifest(pluginPath, candidate);
  },
  /\[TODO:/
);

const staleVersion = structuredClone(manifest);
staleVersion.version = "9.9.9";
assert.notEqual(staleVersion.version, packageJson.version, "Codex manifest version drift should be observable by regression tests");

console.log("Codex plugin JSON manifest validates and rejects stale or unsupported shapes.");
