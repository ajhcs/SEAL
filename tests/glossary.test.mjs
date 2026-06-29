import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routeSealRequest } from "../src/skill-routing/route.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const glossary = await readFile(path.join(root, "plugin", "docs", "glossary.md"), "utf8");
const firstRun = await readFile(path.join(root, "plugin", "docs", "first-run.md"), "utf8");
const skill = await readFile(path.join(root, "plugin", "skills", "seal", "SKILL.md"), "utf8");
const manifest = JSON.parse(await readFile(path.join(root, "plugin", "manifest.json"), "utf8"));

for (const required of [
  "What exists",
  "What changes",
  "What would prove it",
  "What blocks launch",
  "Source authority",
  "Traceability",
  "Validation",
  "Verification",
  "Launch gate",
  "Hazard or risk",
  "File coverage",
  "Reference integrity",
  "Who is this for?",
  "What should never happen?",
  "What would prove this worked?",
  "Can users lose work here?"
]) {
  assert.ok(glossary.includes(required), `glossary should include ${required}`);
}

for (const forbidden of [
  /\bRTM\b(?!, V&V, or FMEA)/,
  /\bFMEA\b(?! in public output)/,
  /requirements-engineering/i
]) {
  assert.equal(forbidden.test(glossary), false, `glossary should avoid unexplained jargon: ${forbidden}`);
}

assert.ok(firstRun.includes("plugin/docs/glossary.md"), "first-run docs should point public copy to the glossary");
assert.ok(skill.includes("plugin/docs/glossary.md"), "skill instructions should route public copy through the glossary");
assert.ok(
  manifest.docs.some((doc) => doc.id === "plain-language-glossary" && doc.path === "docs/glossary.md"),
  "manifest should expose the glossary"
);

for (const route of [
  routeSealRequest("Use SEAL to map this repo and tell me what is unknown"),
  routeSealRequest("Analyze the impact of changing the auth workflow"),
  routeSealRequest("Build proof for the launch report and validate gates"),
  routeSealRequest("Validate .seal/map.yaml reference integrity against the schema")
]) {
  assert.equal(typeof route.plainLabel, "string", "route should include a plain label");
  assert.ok(route.plainLabel.length > 0, "route plain label should not be empty");
  assert.ok(Array.isArray(route.starterQuestions), "route should include starter questions");
  assert.ok(route.starterQuestions.length >= 3, "route should include multiple starter questions");
  assert.ok(route.starterQuestions.every((question) => question.endsWith("?")), "starter questions should be questions");
}

console.log("Plain-language glossary and route copy passed.");
