import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GUIDE_FLOW_STATES, runGuideWorkflow } from "../src/guide/workflow.mjs";

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-guide-workflow-"));
const expectedFlow = [
  "start",
  "project-intent",
  "system-boundary",
  "current-reality",
  "planned-change",
  "proof-plan",
  "readiness-review"
];

async function assertGuideOutput(root, result) {
  assert.equal(result.validation.valid, true);
  assert.deepEqual(GUIDE_FLOW_STATES.map((state) => state.id), expectedFlow);
  await stat(path.join(root, ".seal", "plan.yaml"));
  await stat(path.join(root, ".seal", "map.yaml"));
  await stat(path.join(root, ".seal", "proof.yaml"));
  await stat(path.join(root, ".seal", "debt.yaml"));
  await stat(path.join(root, ".seal", "fly", "FLY-generated.yaml"));
  await stat(path.join(root, ".seal", "reports", "guide.md"));
  await stat(path.join(root, ".seal", "reports", "proof-gaps.md"));
  await stat(path.join(root, ".seal", "reports", "launch-readiness.md"));

  const guide = await readFile(path.join(root, ".seal", "reports", "guide.md"), "utf8");
  assert.match(guide, /non-authoritative view/);
  assert.match(guide, /## Flow States/);
  assert.match(guide, /Project Intent/);
  assert.match(guide, /\.seal\/plan\.yaml/);
  assert.match(guide, /\.seal\/map\.yaml/);
  assert.match(guide, /\.seal\/proof\.yaml/);
  assert.match(guide, /Validation status: passed/);
  assert.ok(result.nextSteps.length > 0);
}

try {
  const planCase = path.join(tempRoot, "plan-first");
  await mkdir(planCase, { recursive: true });
  const planPath = path.join(planCase, "checkout-assistant.md");
  await writeFile(
    planPath,
    "# Checkout assistant\n\n## Goals\n\n- Help support agents inspect order failures before refunds.\n\n## Acceptance criteria\n\n- The agent can identify the failing checkout step.\n",
    "utf8"
  );
  const planResult = await runGuideWorkflow(planPath);
  await assertGuideOutput(planCase, planResult);
  assert.equal(planResult.targetKind, "plan");
  assert.ok(planResult.nextSteps.some((step) => step.includes("Name the planned change target")));

  const repoCase = path.join(tempRoot, "repo-first");
  await mkdir(path.join(repoCase, "src"), { recursive: true });
  await mkdir(path.join(repoCase, "tests"), { recursive: true });
  await writeFile(path.join(repoCase, "README.md"), "# Checkout service\n", "utf8");
  await writeFile(path.join(repoCase, "package.json"), "{\"type\":\"module\",\"scripts\":{\"test\":\"node tests/index.test.js\"}}\n", "utf8");
  await writeFile(path.join(repoCase, "src", "index.js"), "export function status() { return 'ok'; }\n", "utf8");
  await writeFile(path.join(repoCase, "tests", "index.test.js"), "import '../src/index.js';\n", "utf8");

  const repoResult = await runGuideWorkflow(repoCase, {
    changeTarget: "src/index.js",
    summary: "Assess the public entrypoint change."
  });
  await assertGuideOutput(repoCase, repoResult);
  assert.equal(repoResult.targetKind, "repo");
  assert.equal(repoResult.change.change.target, "src/index.js");
  await stat(repoResult.written.impact);
  const repoGuide = await readFile(repoResult.guideReportPath, "utf8");
  assert.match(repoGuide, /src\/index\.js/);
  assert.match(repoGuide, /IMPACT-/);

  const rerunResult = await runGuideWorkflow(repoCase, {
    changeTarget: "src/index.js",
    summary: "Recheck the same public entrypoint change."
  });
  await assertGuideOutput(repoCase, rerunResult);
  assert.equal(rerunResult.validation.valid, true);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Guided workflow generates validated SEAL artifacts for plan-first, repo-first, and existing .seal cases.");
