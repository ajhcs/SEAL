import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };
import { loadPluginManifest } from "../src/plugin/manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(root, "plugin");
const codexManifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");

function assertArchiveLocalPath(relativePath, label) {
  assert.match(relativePath, /^\.\//, `${label} should be explicit relative plugin path`);
  assert.equal(relativePath.includes(".."), false, `${label} must not traverse outside plugin root`);
  const absolutePath = path.resolve(pluginRoot, relativePath);
  const relativeToPlugin = path.relative(pluginRoot, absolutePath);
  assert.equal(
    relativeToPlugin === "" || (!relativeToPlugin.startsWith("..") && !path.isAbsolute(relativeToPlugin)),
    true,
    `${label} must resolve inside plugin root`
  );
  return absolutePath;
}

const internalManifest = await loadPluginManifest();
const codexManifest = JSON.parse(await readFile(codexManifestPath, "utf8"));

assert.equal(codexManifest.name, internalManifest.id);
assert.equal(codexManifest.version, packageJson.version);
assert.match(codexManifest.description, /SEAL artifacts|launch-readiness/);
assert.equal(codexManifest.skills, "./skills/");
assert.equal("commands" in codexManifest, false, "Codex plugin manifest must not declare repo-local package commands");
assert.equal("hooks" in codexManifest, false, "unsupported hooks field should not be present");
assert.equal("apps" in codexManifest, false, "apps should not be declared without .app.json");
assert.equal("mcpServers" in codexManifest, false, "mcpServers should not be declared without .mcp.json");

await stat(assertArchiveLocalPath(codexManifest.skills, "skills"));

for (const skill of internalManifest.entrypoints.skills) {
  assert.equal(skill.path.startsWith("../"), false, `${skill.id} skill path must stay inside plugin root`);
  await stat(path.join(pluginRoot, skill.path));
}

for (const assetPath of [
  codexManifest.interface?.composerIcon,
  codexManifest.interface?.logo,
  codexManifest.interface?.logoDark,
  ...(codexManifest.interface?.screenshots ?? [])
].filter(Boolean)) {
  await stat(assertArchiveLocalPath(assetPath, `asset ${assetPath}`));
}

const layoutDoc = await readFile(path.join(pluginRoot, "docs", "plugin-root-layout.md"), "utf8");
assert.match(layoutDoc, /plugin\/` as the installable Codex plugin root|`plugin\/` as the installable Codex plugin root/);
assert.match(layoutDoc, /does not point at `\.\.\/src`/);
assert.match(layoutDoc, /Runtime commands are package prerequisites/);

console.log("Codex plugin root layout keeps ingestion paths inside plugin archive.");
