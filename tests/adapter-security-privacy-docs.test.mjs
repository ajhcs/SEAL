import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = await readFile(path.join(root, "plugin", "docs", "adapter-security-privacy.md"), "utf8");

for (const heading of [
  "## Trust Boundaries",
  "## Data Classes",
  "## Read Policy",
  "## Write Policy",
  "## Return Policy",
  "## Transmission Policy",
  "## Secret Handling",
  "## Review Checklist",
  "## Fixture Review Commands"
]) {
  assert.ok(doc.includes(heading), `security/privacy doc should include ${heading}`);
}

for (const requiredPhrase of [
  "local-first",
  "requires no network access",
  "no app-only launch logic",
  "do not return bulk source files",
  "Do not crawl the user's home directory",
  "Do not modify product source files",
  "secret values",
  "redacted diagnostic",
  "privacy policy",
  "data retention statement",
  "ChatGPT App availability",
  "marketplace installation",
  "replacement of human launch approval"
]) {
  assert.ok(doc.includes(requiredPhrase), `security/privacy doc should include phrase: ${requiredPhrase}`);
}

for (const dataClass of [
  "Workspace locator",
  "Source content",
  "SEAL artifacts",
  "Evidence records",
  "Diagnostics",
  "User prompts and summaries",
  "Secrets and credentials"
]) {
  assert.match(doc, new RegExp(`\\| ${dataClass} \\|`), `${dataClass} should be listed as a data class`);
}

for (const commandName of [
  "seal-invoke",
  "seal-context-pack",
  "seal-launch-report",
  "seal-validate",
  "npm run smoke:plugin"
]) {
  assert.match(doc, new RegExp(commandName), `${commandName} should be included as a fixture review command`);
}

for (const referencedContract of [
  "mcp-tool-contract.md",
  "app-output-schemas.md"
]) {
  assert.ok(doc.includes(referencedContract), `${referencedContract} should be referenced`);
}

console.log("Adapter security/privacy docs check passed.");
