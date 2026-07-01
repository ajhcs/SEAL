import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";
import { stringifyArtifact } from "../src/artifacts/generate.mjs";
import { invokeSeal } from "../src/invocation/invoke.mjs";
import { writeIngestionGapReview } from "../src/ingestion/gap-review.mjs";
import { writeLaunchReadinessReport } from "../src/launch/readiness-report.mjs";
import { writeMapViews } from "../src/map/render-views.mjs";
import { validateSealArtifacts } from "../src/validation/validate.mjs";

async function readYaml(filePath) {
  return YAML.parse(await readFile(filePath, "utf8"));
}

async function writeYaml(filePath, value) {
  await writeFile(filePath, stringifyArtifact(value), "utf8");
}

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-rerun-semantics-"));

try {
  await writeFile(path.join(tempRoot, "README.md"), "# Rerun semantics\n", "utf8");
  await writeFile(path.join(tempRoot, "package.json"), "{\"type\":\"module\"}\n", "utf8");

  await invokeSeal(tempRoot);

  const sealRoot = path.join(tempRoot, ".seal");
  const ontologyPath = path.join(sealRoot, "ontology.yaml");
  const mapPath = path.join(sealRoot, "map.yaml");
  const planPath = path.join(sealRoot, "plan.yaml");
  const proofPath = path.join(sealRoot, "proof.yaml");
  const evidencePath = path.join(sealRoot, "evidence", "index.yaml");

  const ontology = await readYaml(ontologyPath);
  ontology.action_types.find((action) => action.id === "reload_canonical").name = "Human Reviewed Reload";
  ontology.canonical_reload.description = "Human-edited reload rule must survive reruns and drive generated reports.";
  await writeYaml(ontologyPath, ontology);

  const map = await readYaml(mapPath);
  const sourceId = map.sources[0].id;
  const componentId = map.components[0].id;
  map.sources[0].label = "Human Reviewed Inventory";
  map.sources[0].authority_state = "human_approved";
  map.components[0].name = "Human Reviewed Repository";
  map.components[0].purpose = "Human-edited component purpose survives rerun and appears in generated views.";
  map.components[0].approval_state = "approved";
  map.relationships.push({
    id: "rel.human-reviewed-approval",
    ontology_type: "trace_relation",
    ontology_id: "rel.human-reviewed-approval",
    type: "approved_by",
    from: componentId,
    to: sourceId,
    summary: "Human-approved source authority applies to the reviewed component.",
    source_refs: [sourceId],
    authority_state: "human_approved",
    approval_state: "approved",
    confidence: 1
  });
  await writeYaml(mapPath, map);

  const plan = await readYaml(planPath);
  plan.objective.summary = "Human-edited launch objective survives canonical reruns.";
  plan.approval_needs[0].status = "approved";
  plan.approval_needs[0].approval_state = "approved";
  await writeYaml(planPath, plan);

  const proof = await readYaml(proofPath);
  proof.claims[0].approval_state = "approved";
  proof.claims[0].authority_state = "human_approved";
  proof.claims[0].plain_language = "Human-approved proof claim text survives rerun.";
  proof.evidence[0].type = "human_approval";
  proof.evidence[0].result = "passed";
  proof.evidence[0].source = {
    kind: "human_review",
    summary: "Human approval rerun note survives canonical reload."
  };
  proof.evidence[0].authority_state = "human_approved";
  proof.evidence[0].approval_state = "approved";
  proof.gaps[0].status = "accepted";
  proof.gaps[0].summary = "Human accepted proof gap remains visible after rerun.";
  proof.gaps[0].authority_state = "human_approved";
  proof.gaps[0].approval_state = "approved";
  await writeYaml(proofPath, proof);

  const evidenceIndex = await readYaml(evidencePath);
  evidenceIndex.evidence[0].type = "human_approval";
  evidenceIndex.evidence[0].status = "passed";
  evidenceIndex.evidence[0].source = proof.evidence[0].source;
  evidenceIndex.evidence[0].authority_state = "human_approved";
  evidenceIndex.evidence[0].approval_state = "approved";
  await writeYaml(evidencePath, evidenceIndex);

  await invokeSeal(tempRoot);

  const rerunOntology = await readYaml(ontologyPath);
  const rerunMap = await readYaml(mapPath);
  const rerunPlan = await readYaml(planPath);
  const rerunProof = await readYaml(proofPath);
  assert.equal(rerunOntology.action_types.find((action) => action.id === "reload_canonical").name, "Human Reviewed Reload");
  assert.equal(rerunMap.components[0].purpose, "Human-edited component purpose survives rerun and appears in generated views.");
  assert.ok(rerunMap.relationships.some((relationship) => relationship.id === "rel.human-reviewed-approval"));
  assert.equal(rerunPlan.objective.summary, "Human-edited launch objective survives canonical reruns.");
  assert.equal(rerunProof.claims[0].approval_state, "approved");
  assert.equal(rerunProof.gaps[0].status, "accepted");

  const validation = await validateSealArtifacts(tempRoot);
  assert.equal(validation.valid, true, JSON.stringify(validation.diagnostics, null, 2));

  const views = await writeMapViews(tempRoot);
  const gapReview = await writeIngestionGapReview(tempRoot);
  const launch = await writeLaunchReadinessReport(tempRoot);

  const repoMapMarkdown = await readFile(views.repoMapPath, "utf8");
  const traceability = await readFile(views.traceabilityPath, "utf8");
  const gapReviewMarkdown = await readFile(gapReview.outputPath, "utf8");
  const launchMarkdown = await readFile(launch.outputPath, "utf8");

  assert.match(repoMapMarkdown, /Human-edited component purpose survives rerun/);
  assert.match(traceability, /approved_by/);
  assert.match(gapReviewMarkdown, /Human Reviewed Inventory \(human_approved\)/);
  assert.match(launchMarkdown, /Human accepted proof gap remains visible after rerun/);
  assert.match(launchMarkdown, /Ready with cautions|Blocked|Do not launch|Needs inspection|Ready/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Ontology rerun semantics preserve and consume human-edited canonical fields.");
