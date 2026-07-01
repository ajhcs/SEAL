import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };
import { invokeSeal } from "../src/invocation/invoke.mjs";
import { loadPluginManifest, validatePluginManifest } from "../src/plugin/manifest.mjs";
import { validateSealArtifacts } from "../src/validation/validate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-plugin-smoke-"));

function normalizeManifestPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\.\.\//, "");
}

try {
  const manifestResult = await validatePluginManifest();
  assert.deepEqual(manifestResult.errors, []);
  assert.equal(manifestResult.valid, true);

  const manifest = await loadPluginManifest();
  const manifestCommandBins = manifest.entrypoints.commands.map((command) => command.packageBin);
  assert.deepEqual(manifestCommandBins, Object.keys(packageJson.bin));

  const skill = manifest.entrypoints.skills.find((entry) => entry.id === "seal");
  assert.ok(skill, "manifest should expose the SEAL skill");
  const skillText = await readFile(path.join(root, "plugin", skill.path), "utf8");
  assert.match(skillText, /## Invocation/);
  assert.match(skillText, /seal-invoke <path>/);

  for (const command of manifest.entrypoints.commands) {
    assert.equal(
      normalizeManifestPath(command.path),
      normalizeManifestPath(packageJson.bin[command.packageBin]),
      `${command.id} should resolve to the package bin entry`
    );
    await stat(path.join(root, packageJson.bin[command.packageBin]));
  }

  const targetRoot = path.join(tempRoot, "repo-tiny");
  await cp(path.join(root, "tests", "fixtures", "repo-tiny"), targetRoot, { recursive: true });
  const invocation = await invokeSeal(targetRoot);
  assert.equal(invocation.targetKind, "repo");

  const expectedArtifacts = {
    sources: ".seal/sources.yaml",
    ontology: ".seal/ontology.yaml",
    plan: ".seal/plan.yaml",
    map: ".seal/map.yaml",
    trace: ".seal/trace.yaml",
    debt: ".seal/debt.yaml",
    impact: ".seal/impacts/IMPACT-initial.yaml",
    proof: ".seal/proof.yaml",
    evidenceIndex: ".seal/evidence/index.yaml",
    fly: ".seal/fly/FLY-generated.yaml",
    contextPack: ".seal/context-pack.yaml",
    migration: ".seal/migrations/MIGRATION-v2-initial.md",
    gapReview: ".seal/reports/gap-review.md"
  };

  assert.deepEqual(Object.keys(invocation.written), Object.keys(expectedArtifacts));
  for (const [artifactType, relativePath] of Object.entries(expectedArtifacts)) {
    assert.equal(
      path.relative(targetRoot, invocation.written[artifactType]).replaceAll(path.sep, "/"),
      relativePath
    );
    await stat(path.join(targetRoot, relativePath));
  }

  const validation = await validateSealArtifacts(targetRoot);
  assert.equal(validation.valid, true, JSON.stringify(validation.diagnostics, null, 2));
  assert.equal(validation.validated.length, 7);
  assert.ok(validation.validated.some((artifact) => artifact.artifactType === "fly"));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Plugin smoke passed for manifest discovery, invocation output, and generated artifact validation.");
