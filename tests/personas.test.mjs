import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const personas = await readFile(path.join(root, "plugin", "docs", "personas.md"), "utf8");

for (const required of [
  "Plan Owner Starting From gstack Output",
  "Founder Or Product Builder",
  "Developer Starting From An Existing Repo",
  "Delivery Lead Or Launch Reviewer",
  "Top Guided Jobs",
  "Non-Goals",
  "Beginner-Safe Terms",
  "Terms To Hide Or Explain",
  "Use SEAL on this gstack-style plan",
  "Use SEAL to map this repo",
  "What exists?",
  "What changes?",
  "What would prove it?",
  "What blocks launch?",
  "source authority",
  "traceability"
]) {
  assert.ok(personas.includes(required), `personas note should include: ${required}`);
}

for (const forbidden of [
  /SEAL guarantees correctness/i,
  /SEAL promises zero technical debt/i,
  /use systems-engineering vocabulary as the public explanation/i
]) {
  assert.equal(forbidden.test(personas), false, `personas note should avoid unsupported surface: ${forbidden}`);
}

assert.match(
  personas,
  /gstack[\s\S]*MAP[\s\S]*IMPACT[\s\S]*PROVE/i,
  "gstack persona should connect generated plans to MAP, IMPACT, and PROVE"
);

console.log("Personas note covers first users, jobs, non-goals, and beginner-safe terms.");
