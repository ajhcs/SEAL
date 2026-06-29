import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routeSealRequest } from "../src/skill-routing/route.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const beginnerRepo = routeSealRequest("Use SEAL to map this repo and tell me what is unknown");
assert.equal(beginnerRepo.mode, "beginner");
assert.deepEqual(beginnerRepo.path, [
  "inspect-repo",
  "initialize-seal",
  "ingest",
  "map",
  "render-unknowns",
  "validate"
]);
assert.match(beginnerRepo.askPolicy, /ask only/i);
assert.equal(beginnerRepo.plainLabel, "Show what exists, what is unknown, and what blocks launch.");
assert.deepEqual(beginnerRepo.starterQuestions, [
  "Who is this for?",
  "What should never happen?",
  "What is missing before this can launch?"
]);

const plan = routeSealRequest("Plan a new feature for onboarding users and define acceptance criteria");
assert.equal(plan.mode, "guided");
assert.ok(plan.path.includes("draft-feature-plan"));
assert.ok(plan.path.includes("define-proof-needs"));
assert.ok(plan.path.includes("set-launch-gates"));
assert.match(plan.plainLabel, /traceable plan/i);
assert.ok(plan.starterQuestions.includes("What would prove this worked?"));

const impact = routeSealRequest("Analyze the impact of changing the auth workflow");
assert.equal(impact.mode, "guided");
assert.ok(impact.path.includes("analyze-impact"));
assert.ok(impact.path.includes("record-proof-needs"));
assert.match(impact.plainLabel, /what changes/i);
assert.ok(impact.starterQuestions.includes("Can users lose work here?"));

const proof = routeSealRequest("Build proof for the launch report and validate gates");
assert.equal(proof.mode, "guided");
assert.ok(proof.path.includes("link-evidence"));
assert.ok(proof.path.includes("validate-launch-gates"));
assert.match(proof.plainLabel, /what would prove/i);
assert.ok(proof.starterQuestions.includes("What would prove this worked?"));

const expert = routeSealRequest("Validate .seal/map.yaml reference integrity against the schema");
assert.equal(expert.mode, "advanced");
assert.deepEqual(expert.path, ["inspect-artifacts", "validate-schemas", "validate-references", "report-gaps"]);
assert.match(expert.plainLabel, /valid and connected/i);

const skill = await readFile(path.join(root, "plugin", "skills", "seal", "SKILL.md"), "utf8");
for (const requiredText of [
  "Beginner repo request",
  "Plan request",
  "Impact request",
  "Proof request",
  "Advanced artifact request",
  "ask only for authority gaps",
  "plugin/docs/glossary.md"
]) {
  assert.ok(skill.includes(requiredText), `SKILL.md should document ${requiredText}`);
}

const subskills = [
  ["seal-plan", ["Feature Plan", "Launch Gates", "Source Authority"]],
  ["seal-map", ["SEAL Map", "What Is Unknown", "Source Authority"]],
  ["seal-impact", ["SEAL Impact", "Proof Needed", "Source Authority"]],
  ["seal-proof", ["SEAL Proof", "Launch Gates", "Source Authority"]]
];

for (const [subskill, requiredTexts] of subskills) {
  const body = await readFile(path.join(root, "plugin", "skills", subskill, "SKILL.md"), "utf8");
  assert.doesNotMatch(body, /TODO/);
  assert.match(body, /ask only/i);
  for (const requiredText of requiredTexts) {
    assert.ok(body.includes(requiredText), `${subskill}/SKILL.md should document ${requiredText}`);
  }

  const metadata = await readFile(
    path.join(root, "plugin", "skills", subskill, "agents", "openai.yaml"),
    "utf8"
  );
  assert.ok(metadata.includes(`$${subskill}`), `${subskill} OpenAI metadata should reference the skill`);
}

console.log("Skill routing passed for plan, map, impact, proof, and advanced artifact requests.");
