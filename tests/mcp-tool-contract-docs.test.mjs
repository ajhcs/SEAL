import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = await readFile(path.join(root, "plugin", "docs", "mcp-tool-contract.md"), "utf8");

for (const toolName of [
  "seal.ingest_plan",
  "seal.map_project",
  "seal.validate_artifacts",
  "seal.analyze_impact",
  "seal.generate_launch_report",
  "seal.context_pack"
]) {
  assert.match(doc, new RegExp(`### \`${toolName.replace(".", "\\.")}\``), `${toolName} should be documented as an MCP tool`);
}

for (const commandName of [
  "seal-invoke",
  "seal-inventory",
  "seal-map-views",
  "seal-validate",
  "seal-impact",
  "seal-launch-report",
  "seal-context-pack"
]) {
  assert.match(doc, new RegExp(commandName), `${commandName} should be mapped to an MCP tool`);
}

for (const fixturePath of [
  "tests/fixtures/markdown-plans/gstack-style.md",
  "tests/fixtures/repo-tiny",
  "plugin/fixtures/minimal",
  "tests/fixtures/full-workflow/pass"
]) {
  assert.match(doc, new RegExp(fixturePath.replaceAll("/", "\\/")), `${fixturePath} should appear in fixture review commands`);
}

for (const requiredPhrase of [
  "structured data plus a concise `user_summary`",
  "No app-only logic belongs in the adapter",
  "Require no network access",
  "ChatGPT App availability",
  "marketplace installation",
  "replacement of human launch approval",
  "artifact_validation_failed",
  "validateSealArtifacts",
  "No app-only logic"
]) {
  assert.ok(doc.includes(requiredPhrase), `MCP contract should include phrase: ${requiredPhrase}`);
}

for (const errorCode of [
  "input_not_found",
  "unsupported_input",
  "artifact_validation_failed",
  "missing_artifact",
  "write_failed",
  "execution_failed"
]) {
  assert.match(doc, new RegExp(`\`${errorCode}\``), `${errorCode} should be listed as a common error code`);
}

assert.match(doc, /"ok": false/);
assert.match(doc, /"diagnostics": \[\]/);
assert.match(doc, /"user_summary":/);

console.log("MCP tool contract docs check passed.");
