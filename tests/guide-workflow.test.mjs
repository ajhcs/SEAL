import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringifyArtifact } from "../src/artifacts/generate.mjs";
import { parseYamlArtifact } from "../src/artifacts/schema-registry.mjs";
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
const HUMAN_COMPONENT_PURPOSE = "Human-edited canonical purpose that must drive generated views.";
const HUMAN_PROOF_GAP = "Human-edited proof gap that must drive readiness.";
const HUMAN_EVIDENCE_ID = "ev.human-edited-proof";

async function walkYamlFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkYamlFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".yaml")) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function isCanonicalSealYaml(root, filePath) {
  const relativePath = path.relative(root, filePath).replaceAll(path.sep, "/");
  return relativePath.startsWith(".seal/")
    && relativePath.endsWith(".yaml")
    && relativePath !== ".seal/index.yaml"
    && relativePath !== ".seal/context-pack.yaml"
    && !relativePath.startsWith(".seal/fly/");
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstSourceRef(artifact) {
  return asList(artifact?.source_refs)[0]
    ?? asList(artifact?.sources).map((source) => source.id).find(Boolean)
    ?? "src.repo";
}

async function writeHumanCanonicalEdits(root) {
  const mapPath = path.join(root, ".seal", "map.yaml");
  const map = await parseYamlArtifact(mapPath);
  const component = asList(map.components ?? map.observed?.components)[0];
  assert.ok(component, "generated MAP should include at least one component");
  component.purpose = HUMAN_COMPONENT_PURPOSE;
  component.source_refs = asList(component.source_refs).length ? component.source_refs : [firstSourceRef(map)];
  await writeFile(mapPath, `${stringifyArtifact(map).trimEnd()}\n# human annotation: preserve this note\n`, "utf8");

  const proofPath = path.join(root, ".seal", "proof.yaml");
  const proof = await parseYamlArtifact(proofPath);
  const gap = asList(proof.gaps)[0];
  const claim = asList(proof.claims)[0];
  assert.ok(gap, "generated PROVE should include at least one gap");
  assert.ok(claim, "generated PROVE should include at least one claim");
  gap.summary = HUMAN_PROOF_GAP;
  gap.next_step = HUMAN_PROOF_GAP;
  gap.status = "open";
  claim.gap_refs = [gap.id];
  claim.evidence_refs = [HUMAN_EVIDENCE_ID];
  claim.source_refs = asList(claim.source_refs).length ? claim.source_refs : [firstSourceRef(proof)];
  await writeFile(proofPath, stringifyArtifact(proof), "utf8");

  const evidencePath = path.join(root, ".seal", "evidence", "index.yaml");
  const evidenceIndex = await parseYamlArtifact(evidencePath);
  const evidence = asList(evidenceIndex.evidence)[0];
  assert.ok(evidence, "generated evidence index should include at least one evidence record");
  evidence.id = HUMAN_EVIDENCE_ID;
  evidence.summary = "Human-edited evidence record that must drive proof views.";
  evidence.status = "passed";
  evidence.source_refs = asList(evidence.source_refs).length ? evidence.source_refs : [firstSourceRef(evidenceIndex)];
  await writeFile(evidencePath, stringifyArtifact(evidenceIndex), "utf8");
}

async function canonicalSnapshots(root) {
  const files = (await walkYamlFiles(path.join(root, ".seal"))).filter((filePath) => isCanonicalSealYaml(root, filePath));
  const snapshots = new Map();
  for (const filePath of files) {
    snapshots.set(path.relative(root, filePath).replaceAll(path.sep, "/"), await readFile(filePath, "utf8"));
  }
  return snapshots;
}

async function assertCanonicalSnapshotsPreserved(root, before) {
  const after = await canonicalSnapshots(root);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  for (const [relativePath, content] of before) {
    assert.equal(after.get(relativePath), content, `${relativePath} should be preserved byte-for-byte`);
  }
}

async function assertGuideOutput(root, result) {
  assert.equal(result.validation.valid, true);
  assert.deepEqual(GUIDE_FLOW_STATES.map((state) => state.id), expectedFlow);
  await stat(path.join(root, ".seal", "plan.yaml"));
  await stat(path.join(root, ".seal", "map.yaml"));
  await stat(path.join(root, ".seal", "proof.yaml"));
  await stat(path.join(root, ".seal", "debt.yaml"));
  await stat(path.join(root, ".seal", "fly", "FLY-generated.yaml"));
  await stat(path.join(root, ".seal", "index.yaml"));
  await stat(path.join(root, ".seal", "reports", "guide.md"));
  await stat(path.join(root, ".seal", "reports", "proof-gaps.md"));
  await stat(path.join(root, ".seal", "reports", "launch-readiness.md"));
  await stat(result.written.artifactIndex);

  const guide = await readFile(path.join(root, ".seal", "reports", "guide.md"), "utf8");
  assert.match(guide, /non-authoritative view/);
  assert.match(guide, /preserve existing canonical/);
  assert.match(guide, /## Flow States/);
  assert.match(guide, /## Artifact Outputs/);
  assert.match(guide, /Project Intent/);
  assert.match(guide, /\.seal\/plan\.yaml/);
  assert.match(guide, /\.seal\/map\.yaml/);
  assert.match(guide, /\.seal\/proof\.yaml/);
  assert.match(guide, /Artifact index/);
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
  assert.ok(planResult.nextSteps.some((step) => step.includes("seal guide <directory|plan.md> [change target] [summary]")));

  const repoCase = path.join(tempRoot, "repo-first");
  await mkdir(path.join(repoCase, "src"), { recursive: true });
  await mkdir(path.join(repoCase, "tests"), { recursive: true });
  await writeFile(path.join(repoCase, "README.md"), "# Checkout service\n", "utf8");
  await writeFile(path.join(repoCase, "package.json"), "{\"type\":\"module\",\"scripts\":{\"test\":\"node tests/index.test.js\"}}\n", "utf8");
  await writeFile(path.join(repoCase, "src", "index.js"), "export function status() { return 'ok'; }\n", "utf8");
  await writeFile(path.join(repoCase, "tests", "index.test.js"), "import '../src/index.js';\n", "utf8");

  const changeSummary = "Assess the public entrypoint change.";
  const repoResult = await runGuideWorkflow(repoCase, {
    changeTarget: "src/index.js",
    summary: changeSummary
  });
  await assertGuideOutput(repoCase, repoResult);
  assert.equal(repoResult.targetKind, "repo");
  assert.equal(repoResult.change.change.target, "src/index.js");
  await stat(repoResult.written.impact);
  const repoGuide = await readFile(repoResult.guideReportPath, "utf8");
  assert.match(repoGuide, /src\/index\.js/);
  assert.match(repoGuide, /IMPACT-/);

  await writeHumanCanonicalEdits(repoCase);
  const mapPath = path.join(repoCase, ".seal", "map.yaml");
  const beforeRerun = await canonicalSnapshots(repoCase);
  for (const generatedPath of [
    repoResult.written.artifactIndex,
    repoResult.written.repoMap,
    repoResult.written.systemMap,
    repoResult.written.componentGraph,
    repoResult.written.interfaceDataFlow,
    repoResult.written.debtView,
    repoResult.written.proofGaps,
    repoResult.written.launchReadiness,
    repoResult.written.guideReport
  ].filter(Boolean)) {
    await rm(generatedPath, { force: true });
  }

  const rerunResult = await runGuideWorkflow(repoCase, {
    changeTarget: "src/index.js",
    summary: changeSummary
  });
  await assertGuideOutput(repoCase, rerunResult);
  assert.equal(rerunResult.validation.valid, true);
  await assertCanonicalSnapshotsPreserved(repoCase, beforeRerun);
  assert.match(await readFile(mapPath, "utf8"), /human annotation: preserve this note/);
  assert.equal(rerunResult.written.writeActions.map.action, "preserved");
  assert.equal(rerunResult.written.writeActions.proof.action, "preserved");
  assert.equal(rerunResult.written.writeActions.contextPack.action, "refreshed");
  assert.equal(rerunResult.written.writeActions.artifactIndex.action, "refreshed");
  assert.equal(rerunResult.canonicalAuthority.authority, "canonical");
  assert.equal(rerunResult.canonicalAuthority.source, "disk");
  assert.ok(rerunResult.canonicalAuthority.paths.includes(".seal/map.yaml"));

  const repoMapView = await readFile(rerunResult.written.repoMap, "utf8");
  assert.match(repoMapView, new RegExp(escapeRegExp(HUMAN_COMPONENT_PURPOSE)));
  const systemMap = await readFile(rerunResult.written.systemMap, "utf8");
  assert.match(systemMap, new RegExp(escapeRegExp(HUMAN_COMPONENT_PURPOSE)));
  const proofGaps = await readFile(rerunResult.written.proofGaps, "utf8");
  assert.match(proofGaps, new RegExp(escapeRegExp(HUMAN_EVIDENCE_ID)));
  const launch = await readFile(rerunResult.written.launchReadiness, "utf8");
  assert.match(launch, new RegExp(escapeRegExp(HUMAN_PROOF_GAP)));
  const rerunGuide = await readFile(rerunResult.guideReportPath, "utf8");
  assert.match(rerunGuide, /## Canonical Authority/);
  assert.match(rerunGuide, /Candidate generator artifacts are not used as authority/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Guided workflow creates missing artifacts, preserves canonical records, and refreshes generated views.");
