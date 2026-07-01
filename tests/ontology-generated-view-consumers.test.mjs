import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { writeContextPack } from "../src/context/pack.mjs";
import { writeAiDocs, writeHumanDocs } from "../src/docs/shaper.mjs";
import { invokeSeal } from "../src/invocation/invoke.mjs";
import { writeLaunchReadinessReport } from "../src/launch/readiness-report.mjs";
import { writeMapViews } from "../src/map/render-views.mjs";
import { writeDashboard } from "../src/views/dashboard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "seal-ontology-views-"));
const target = path.join(tempRoot, "repo-tiny");

try {
  await cp(path.join(root, "tests", "fixtures", "repo-tiny"), target, { recursive: true });
  await invokeSeal(target);

  await writeMapViews(target);
  await writeDashboard(target);
  await writeHumanDocs(target);
  await writeAiDocs(target);
  await writeLaunchReadinessReport(target);
  await writeContextPack(target, { target: "src/index.js", summary: "Ontology view consumer test." });

  const repoMap = await readFile(path.join(target, ".seal", "views", "repo-map.md"), "utf8");
  assert.match(repoMap, /## Ontology Model/);
  assert.match(repoMap, /ontology\.seal\.v1/);
  assert.match(repoMap, /Proof states:/);

  const mermaid = await readFile(path.join(target, ".seal", "views", "system-map.mmd"), "utf8");
  assert.match(mermaid, /%% Ontology ontology\.seal\.v1/);
  assert.match(mermaid, /%% Entity types/);
  assert.match(mermaid, /%% States proof=/);

  const dashboard = await readFile(path.join(target, ".seal", "views", "dashboard.md"), "utf8");
  assert.match(dashboard, /## Ontology Model/);
  assert.match(dashboard, /\[ontology:proof_state\]/);
  assert.match(dashboard, /Risk states: not recorded/);

  const docsProposal = await readFile(path.join(target, ".seal", "reports", "docs-proposal.md"), "utf8");
  assert.match(docsProposal, /## Ontology Model/);

  const aiDocs = YAML.parse(await readFile(path.join(target, ".seal", "ai-docs", "context.yaml"), "utf8"));
  assert.equal(aiDocs.ontology.ontology_id, "ontology.seal.v1");
  assert.ok(aiDocs.ontology.entity_types.includes("component"));
  assert.ok(aiDocs.ontology.not_recorded.includes("risk_state"));

  const contextPack = YAML.parse(await readFile(path.join(target, ".seal", "context-pack.yaml"), "utf8"));
  assert.equal(contextPack.ontology.ontology_id, "ontology.seal.v1");
  assert.ok(contextPack.ontology.relationship_types.includes("depends_on"));

  const readiness = await readFile(path.join(target, ".seal", "reports", "launch-readiness.md"), "utf8");
  assert.match(readiness, /## Ontology Model/);
  assert.match(readiness, /Not recorded markers:/);

  await stat(path.join(target, ".seal", "views", "component-graph.mmd"));
  await stat(path.join(target, ".seal", "views", "interface-data-flow.mmd"));
  await stat(path.join(target, ".seal", "views", "readiness-blockers.mmd"));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Generated views consume ontology model ids, states, and not-recorded markers.");
