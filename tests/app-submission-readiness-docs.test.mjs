import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = await readFile(path.join(root, "plugin", "docs", "app-submission-readiness.md"), "utf8");

for (const heading of [
  "## Official Guidance Snapshot",
  "## Current State",
  "## Blocking Checklist",
  "## Submission Packet",
  "## Review Risks",
  "## Local Evidence Commands",
  "## Non-Claims"
]) {
  assert.ok(doc.includes(heading), `submission readiness doc should include ${heading}`);
}

for (const requiredPhrase of [
  "working hosted MCP/App adapter",
  "no public MCP endpoint",
  "Re-check these pages on submission day",
  "OpenAI Platform Dashboard",
  "Developer Mode test evidence",
  "Organization verification",
  "api.apps.write",
  "api.apps.read",
  "Privacy policy URL",
  "Support URL",
  "Authentication decision",
  "review credentials do not require MFA",
  "CSP",
  "Tool annotations",
  "versioned contract",
  "human launch approval"
]) {
  assert.ok(doc.includes(requiredPhrase), `submission readiness doc should include phrase: ${requiredPhrase}`);
}

for (const officialUrl of [
  "https://developers.openai.com/apps-sdk/deploy/submission",
  "https://developers.openai.com/apps-sdk/app-submission-guidelines",
  "https://developers.openai.com/apps-sdk/guides/security-privacy",
  "https://developers.openai.com/apps-sdk/deploy/testing",
  "https://developers.openai.com/apps-sdk/build/auth"
]) {
  assert.ok(doc.includes(officialUrl), `${officialUrl} should be cited in the guidance snapshot`);
}

for (const relatedDoc of [
  "mcp-tool-contract.md",
  "app-output-schemas.md",
  "adapter-security-privacy.md",
  "marketplace-assets.md"
]) {
  assert.ok(doc.includes(relatedDoc), `${relatedDoc} should be referenced`);
}

for (const commandName of [
  "npm run smoke:plugin",
  "seal-invoke",
  "seal-context-pack",
  "seal-launch-report",
  "seal-validate"
]) {
  assert.ok(doc.includes(commandName), `${commandName} should be included as local evidence`);
}

console.log("App submission readiness docs check passed.");
