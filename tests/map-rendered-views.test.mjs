import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMinimalArtifactSet } from "../src/artifacts/generate.mjs";
import { GENERATED_VIEW_NOTICE } from "../src/contracts/constants.mjs";
import { createRepoMap, writeRepoMap } from "../src/inventory/map-repo.mjs";
import { createMapViews, writeMapViews } from "../src/map/render-views.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "repo-inventory");

const map = await createRepoMap(fixtureRoot);
const { markdown, mermaid, summary } = createMapViews(map);

assert.equal(summary.components > 0, true);
assert.equal(summary.files, map.files.length);
assert.equal(summary.gaps, map.gaps.length);

for (const expectedText of [
  "# SEAL Repo Map",
  GENERATED_VIEW_NOTICE,
  "## Observed Reality",
  "## Approved Architecture",
  "## Files By Component",
  "## Dependencies",
  "## Services And Cost",
  "## Interfaces",
  "## Data Stores",
  "## Tests",
  "## Unknowns And Drift",
  "src/index.js",
  "tests/index.test.js",
  "mystery.blob",
  "gap.unknown-file.mystery"
]) {
  assert.ok(markdown.includes(expectedText), `Markdown map view should include ${expectedText}`);
}

assert.ok(mermaid.includes(GENERATED_VIEW_NOTICE), "Mermaid view should be marked generated");
assert.ok(mermaid.includes("flowchart LR"), "Mermaid view should be a flowchart");
assert.ok(mermaid.includes('cmp_repo["cmp.repo"]'), "Mermaid view should include component nodes");
assert.ok(map.relationships.length > 0, "canonical MAP relationships should exist for generated views");

const artifacts = createMinimalArtifactSet();
const navigationViews = createMapViews(artifacts.map, {
  sources: artifacts.sources,
  plan: artifacts.plan,
  trace: artifacts.trace,
  proof: artifacts.proof,
  evidenceIndex: artifacts.evidenceIndex,
  debt: artifacts.debt,
  impacts: [artifacts.impact],
  fly: [artifacts.fly]
});

for (const [name, contents] of [
  ["system-map.mmd", navigationViews.mermaid],
  ["component-graph.mmd", navigationViews.componentGraph],
  ["interface-data-flow.mmd", navigationViews.interfaceDataFlow],
  ["traceability.mmd", navigationViews.traceability],
  ["proof-evidence.mmd", navigationViews.proofEvidence],
  ["readiness-blockers.mmd", navigationViews.readinessBlockers]
]) {
  assert.ok(contents.includes(GENERATED_VIEW_NOTICE), `${name} should be marked generated`);
  assert.ok(contents.includes("flowchart "), `${name} should use Mermaid flowchart syntax`);
  assert.ok(contents.includes("Non-authoritative navigation view"), `${name} should identify canonical sources`);
}

assert.ok(navigationViews.traceability.includes("plan_PLAN_generated"), "Traceability should render plan nodes");
assert.ok(navigationViews.traceability.includes("map_component_cmp_generated"), "Traceability should render map component nodes");
assert.ok(
  navigationViews.proofEvidence.includes("proof_claim_claim_generated_readable"),
  "Proof/evidence view should render proof claim nodes"
);
assert.ok(navigationViews.proofEvidence.includes("evidence_ev_generated_gap"), "Proof/evidence view should render evidence nodes");
assert.ok(navigationViews.readinessBlockers.includes("impact_IMPACT_generated"), "Readiness view should render impact nodes");
assert.ok(navigationViews.readinessBlockers.includes("fly_FLY_generated"), "Readiness view should render fly nodes");
assert.ok(navigationViews.navigationMarkdown.includes("proof-evidence.mmd"), "Navigation companion should list scoped views");
assert.ok(
  navigationViews.navigationMarkdown.includes("Omitted canonical records: none"),
  "Navigation companion should state when no records were omitted"
);

const canonicalPrefixes = /^(map|source|plan|proof|evidence|impact|fly|gate)\./;
for (const summary of Object.values(navigationViews.navigationSummary.views)) {
  assert.ok(
    summary.canonicalRecords.every((record) => canonicalPrefixes.test(record)),
    `${summary.name} should only include canonical SEAL record IDs`
  );
}

const cappedViews = createMapViews(artifacts.map, {
  sources: artifacts.sources,
  plan: artifacts.plan,
  trace: artifacts.trace,
  proof: artifacts.proof,
  evidenceIndex: artifacts.evidenceIndex,
  impacts: [artifacts.impact],
  fly: [artifacts.fly],
  limits: { maxNodes: 1, maxEdges: 0 }
});
assert.ok(cappedViews.traceability.includes("Truncated:"), "Capped Mermaid should include truncation notice");
assert.ok(
  cappedViews.navigationMarkdown.includes("Omitted canonical records:"),
  "Navigation companion should list omitted records when capped"
);

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-map-views-"));
try {
  await cp(fixtureRoot, tempRoot, { recursive: true });
  await writeRepoMap(tempRoot);
  await writeFile(path.join(tempRoot, ".seal", "context-pack.yaml"), "id: [bad\n", "utf8");
  const written = await writeMapViews(tempRoot);
  const writtenMarkdown = await readFile(written.repoMapPath, "utf8");
  const writtenMermaid = await readFile(written.systemMapPath, "utf8");
  const writtenTraceability = await readFile(written.traceabilityPath, "utf8");
  const writtenProofEvidence = await readFile(written.proofEvidencePath, "utf8");
  const writtenReadinessBlockers = await readFile(written.readinessBlockersPath, "utf8");
  const writtenNavigation = await readFile(written.navigationPath, "utf8");
  assert.ok(writtenMarkdown.includes("## Unknowns And Drift"));
  assert.ok(writtenMarkdown.includes("mystery.blob"));
  assert.ok(writtenMermaid.includes("flowchart LR"));
  assert.ok(writtenTraceability.includes("flowchart LR"));
  assert.ok(writtenTraceability.includes("owned_by"), "Traceability view should include ontology relationship labels");
  assert.ok(writtenProofEvidence.includes("flowchart LR"));
  assert.ok(writtenReadinessBlockers.includes("flowchart TD"));
  assert.ok(writtenNavigation.includes("SEAL Mermaid Navigation"));

  await writeFile(path.join(tempRoot, ".seal", "proof.yaml"), "id: [bad\n", "utf8");
  await assert.rejects(
    () => writeMapViews(tempRoot),
    /Flow sequence/
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Map rendered views passed for Markdown sections, Mermaid navigation views, tests, and visible unknown gaps.");
