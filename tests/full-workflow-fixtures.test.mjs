import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseYamlArtifact } from "../src/artifacts/schema-registry.mjs";
import { writeLaunchReadinessReport } from "../src/launch/readiness-report.mjs";
import { createMapViews } from "../src/map/render-views.mjs";
import { createProofGapReport } from "../src/proof/gap-report.mjs";
import { validateSealArtifacts } from "../src/validation/validate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = path.join(root, "tests", "fixtures", "full-workflow");

async function readArtifacts(fixtureRoot) {
  return {
    map: await parseYamlArtifact(path.join(fixtureRoot, ".seal", "map.yaml")),
    proof: await parseYamlArtifact(path.join(fixtureRoot, ".seal", "proof.yaml")),
    evidenceIndex: await parseYamlArtifact(path.join(fixtureRoot, ".seal", "evidence", "index.yaml"))
  };
}

function decisionIds(report) {
  return new Set(report.policy.decisions.map((decision) => decision.id));
}

const tempFixturesRoot = await mkdtemp(path.join(os.tmpdir(), "seal-full-workflow-"));
await cp(fixturesRoot, tempFixturesRoot, { recursive: true });

try {
const passRoot = path.join(tempFixturesRoot, "pass");
const passValidation = await validateSealArtifacts(passRoot);
assert.equal(passValidation.valid, true, JSON.stringify(passValidation.diagnostics, null, 2));

const passArtifacts = await readArtifacts(passRoot);
const passViews = createMapViews(passArtifacts.map);
assert.deepEqual(passViews.summary, {
  components: 1,
  files: 3,
  gaps: 0,
  dependencies: 0,
  interfaces: 2
});

const passProofReport = createProofGapReport(passArtifacts);
assert.equal(passProofReport.readiness, "proven");
assert.equal(passProofReport.counts.proven, 1);

const passLaunch = await writeLaunchReadinessReport(passRoot);
assert.equal(passLaunch.report.decision.label, "Ready");
assert.equal(passLaunch.report.policy.overall, "pass");
assert.match(await readFile(passLaunch.outputPath, "utf8"), /Launch decision: \*\*Ready\*\*/);

const failRoot = path.join(tempFixturesRoot, "fail");
const failValidation = await validateSealArtifacts(failRoot);
assert.equal(failValidation.valid, false);
assert.ok(
  failValidation.diagnostics.some((diagnostic) =>
    diagnostic.artifactType === "coverage" &&
    diagnostic.actual === "missing from map files" &&
    diagnostic.message.includes("src/unmapped.js")
  ),
  JSON.stringify(failValidation.diagnostics, null, 2)
);

const failArtifacts = await readArtifacts(failRoot);
const failViews = createMapViews(failArtifacts.map);
assert.equal(failViews.summary.components, 1);
assert.equal(failViews.summary.files, 3);
assert.equal(failViews.summary.gaps, 2);
assert.match(failViews.markdown, /gap\.fail\.unmapped/);

const failProofReport = createProofGapReport(failArtifacts);
assert.equal(failProofReport.readiness, "blocked");
assert.equal(failProofReport.counts.failed, 1);
assert.match(failProofReport.markdown, /Failed evidence is linked/);

const failLaunch = await writeLaunchReadinessReport(failRoot);
assert.equal(failLaunch.report.decision.label, "Do not launch");
assert.equal(failLaunch.report.policy.overall, "fail");

const failDecisionIds = decisionIds(failLaunch.report);
assert.equal(failDecisionIds.has("gate.launch.unmapped-files-block-launch"), true);
assert.equal(failDecisionIds.has("gate.prove.no-failed-evidence"), true);
assert.equal(failDecisionIds.has("gate.impact.proof-required.IMPACT-fail-launch.proofreq.fail.launch"), true);

const failMarkdown = await readFile(failLaunch.outputPath, "utf8");
assert.match(failMarkdown, /Launch decision: \*\*Do not launch\*\*/);
assert.match(failMarkdown, /src\/unmapped\.js/);
assert.match(failMarkdown, /Failed evidence blocks proof/);

console.log("Full workflow fixtures cover passing and failing MAP, IMPACT, PROVE, validation, and launch readiness paths.");
} finally {
  await rm(tempFixturesRoot, { recursive: true, force: true });
}
