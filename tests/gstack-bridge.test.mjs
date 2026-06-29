import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bridge = await readFile(path.join(root, "plugin", "docs", "gstack-bridge.md"), "utf8");

for (const required of [
  "plan-generation complement",
  "Positioning",
  "Import Assumptions",
  "Example Input Shape",
  "Conversion Story",
  "Import Report Expectations",
  "No-Attack Framing",
  "gstack-style Markdown",
  "MAP",
  "IMPACT",
  "PROVE",
  "VALIDATE",
  "LAUNCH",
  "what was mapped directly",
  "what was inferred",
  "owner approval",
  "plan creation into plan maintenance, proof, and launch discipline"
]) {
  assert.ok(bridge.includes(required), `gstack bridge should include: ${required}`);
}

for (const forbidden of [
  /gstack is worse than SEAL/i,
  /SEAL replaces gstack/i,
  /SEAL assumes one exact output format/i
]) {
  assert.equal(forbidden.test(bridge), false, `gstack bridge should avoid unsupported framing: ${forbidden}`);
}

assert.match(
  bridge,
  /appointment scheduler[\s\S]*acceptance[\s\S]*proof claims/i,
  "gstack bridge should include a representative plan shape with acceptance and proof content"
);

console.log("gstack bridge note covers positioning, import assumptions, conversion, and report expectations.");
