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
  const gapReview = await readFile(path.join(caseRoot, ".seal", "reports", "gap-review.md"), "utf8");
  const validation = await validateSealArtifacts(caseRoot);
  assert.equal(validation.valid, true, `${name} generated artifacts should validate: ${JSON.stringify(validation.errors)}`);
  return { map, gapReview };
}

try {
  const { map: sparse } = await runPlanFixture("sparse.md");
  assert.ok(sparse.requirements.some((requirement) => requirement.kind === "acceptance_criterion"));
  assert.ok(sparse.gaps.some((gap) => gap.id === "gap.plan-no-launch-gates"));

  const { map: medium } = await runPlanFixture("medium.md");
  assert.ok(medium.requirements.some((requirement) => requirement.summary.includes("appointment requests")));
  assert.ok(medium.requirements.some((requirement) => requirement.kind === "constraint"));
  assert.ok(medium.risks.some((risk) => risk.summary.includes("email delivery")));
  assert.ok(medium.assumptions.some((assumption) => assumption.summary.includes("staff roles")));
  assert.ok(medium.launch_gates.length >= 2);

  const { map: detailed } = await runPlanFixture("detailed.md");
  assert.ok(detailed.requirements.some((requirement) => requirement.summary.includes("schema validation")));
  assert.ok(detailed.requirements.some((requirement) => requirement.kind === "decision"));
  assert.ok(detailed.trace_links.length > 0);
  assert.ok(detailed.launch_gates.some((gate) => gate.summary.includes("proof claims")));
  assert.ok(detailed.requirements.every((requirement) => requirement.authority_state === "inferred"));
  assert.ok(detailed.gaps.some((gap) => gap.id === "gap.plan-human-review"));

  const { map: gstack, gapReview: gstackReview } = await runPlanFixture("gstack-style.md");
  assert.ok(gstack.requirements.some((requirement) => requirement.summary.includes("non-expert founder")));
  assert.ok(gstack.requirements.some((requirement) => requirement.kind === "decision"));
  assert.ok(gstack.requirements.some((requirement) => requirement.kind === "milestone"));
  assert.ok(gstack.risks.some((risk) => risk.summary.includes("missing proof evidence")));
  assert.ok(gstack.assumptions.some((assumption) => assumption.summary.includes("source plan can be revised")));
  assert.ok(gstack.launch_gates.some((gate) => gate.summary.includes("schema validation")));
  assert.ok(gstack.trace_links.length > 0);
  assert.ok(gstack.gaps.some((gap) => gap.id === "gap.plan-gstack-import-review"));
  assert.ok(gstack.requirements.every((requirement) => requirement.authority_state === "inferred"));
  assert.match(gstackReview, /## Import Report/);
  assert.match(gstackReview, /Mapped directly:/);
  assert.match(gstackReview, /Inferred items:/);
  assert.match(gstackReview, /Unresolved items:/);
  assert.match(gstackReview, /Plan file: gstack-style\.md/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Markdown ingestion passed for sparse, medium, detailed, and gstack-style plans.");
