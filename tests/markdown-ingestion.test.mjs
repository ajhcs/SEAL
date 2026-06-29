import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { validateSealArtifacts } from "../src/validation/validate.mjs";
import { invokeSeal } from "../src/invocation/invoke.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "markdown-plans");
const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-markdown-"));

async function runPlanFixture(name) {
  const caseRoot = path.join(tempRoot, name.replace(/\.md$/, ""));
  await mkdir(caseRoot, { recursive: true });
  await cp(path.join(fixtureRoot, name), path.join(caseRoot, name), { recursive: true });
  await invokeSeal(path.join(caseRoot, name));
  const map = YAML.parse(await readFile(path.join(caseRoot, ".seal", "map.yaml"), "utf8"));
  const validation = await validateSealArtifacts(caseRoot);
  assert.equal(validation.valid, true, `${name} generated artifacts should validate: ${JSON.stringify(validation.errors)}`);
  return map;
}

try {
  const sparse = await runPlanFixture("sparse.md");
  assert.ok(sparse.requirements.some((requirement) => requirement.kind === "acceptance_criterion"));
  assert.ok(sparse.gaps.some((gap) => gap.id === "gap.plan-no-launch-gates"));

  const medium = await runPlanFixture("medium.md");
  assert.ok(medium.requirements.some((requirement) => requirement.summary.includes("appointment requests")));
  assert.ok(medium.requirements.some((requirement) => requirement.kind === "constraint"));
  assert.ok(medium.risks.some((risk) => risk.summary.includes("email delivery")));
  assert.ok(medium.assumptions.some((assumption) => assumption.summary.includes("staff roles")));
  assert.ok(medium.launch_gates.length >= 2);

  const detailed = await runPlanFixture("detailed.md");
  assert.ok(detailed.requirements.some((requirement) => requirement.summary.includes("schema validation")));
  assert.ok(detailed.requirements.some((requirement) => requirement.kind === "decision"));
  assert.ok(detailed.trace_links.length > 0);
  assert.ok(detailed.launch_gates.some((gate) => gate.summary.includes("proof claims")));
  assert.ok(detailed.requirements.every((requirement) => requirement.authority_state === "inferred"));
  assert.ok(detailed.gaps.some((gap) => gap.id === "gap.plan-human-review"));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Markdown ingestion passed for sparse, medium, and detailed plans.");
