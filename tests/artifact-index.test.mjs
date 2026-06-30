import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringifyArtifact } from "../src/artifacts/generate.mjs";
import {
  loadArtifactIndex,
  resolveArtifactById,
  resolveArtifactByPath,
  resolveRecordsByAffectedTarget,
  resolveRecordsByRelation,
  validateArtifactIndex,
  writeArtifactIndex
} from "../src/artifacts/index.mjs";
import { invokeSeal } from "../src/invocation/invoke.mjs";
import { validateSealArtifacts } from "../src/validation/validate.mjs";

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-artifact-index-"));

try {
  const repo = path.join(tempRoot, "repo");
  await mkdir(path.join(repo, "src"), { recursive: true });
  await mkdir(path.join(repo, "tests"), { recursive: true });
  await writeFile(path.join(repo, "README.md"), "# Checkout service\n", "utf8");
  await writeFile(
    path.join(repo, "package.json"),
    "{\"type\":\"module\",\"scripts\":{\"test\":\"node tests/index.test.js\"}}\n",
    "utf8"
  );
  await writeFile(path.join(repo, "src", "index.js"), "export function status() { return 'ok'; }\n", "utf8");
  await writeFile(path.join(repo, "tests", "index.test.js"), "import '../src/index.js';\n", "utf8");

  await invokeSeal(repo);
  const index = await loadArtifactIndex(repo);
  assert.equal(index.authoritative, false);
  assert.match(index.notice, /non-authoritative/);
  assert.equal(resolveArtifactById(index, "artifact-index").id, "artifact-index");
  assert.equal(resolveArtifactByPath(index, ".seal/map.yaml").kind, "map");
  assert.ok(
    index.artifacts.some((artifact) => artifact.path === ".seal/map.yaml" && artifact.hash && typeof artifact.bytes === "number"),
    "index should expose compact map metadata"
  );
  assert.ok(index.records.length > 0, "index should expose nested records");

  const relationRecord = index.records.find((record) => record.relation_ids?.length > 0);
  assert.ok(relationRecord, "index should expose relation-bearing records");
  assert.ok(resolveRecordsByRelation(index, relationRecord.relation_ids[0]).length > 0);

  const affectedRecord = index.records.find((record) => record.affected_targets?.length > 0);
  assert.ok(affectedRecord, "index should expose affected target records");
  assert.ok(resolveRecordsByAffectedTarget(index, affectedRecord.affected_targets[0]).length > 0);

  await appendFile(path.join(repo, ".seal", "map.yaml"), "\n# stale index marker\n", "utf8");
  const stale = await validateSealArtifacts(repo);
  assert.equal(stale.valid, false);
  assert.ok(
    stale.diagnostics.some((diagnostic) => diagnostic.artifactType === "artifact_index" && /stale/.test(diagnostic.message)),
    "validation should fail visibly when indexed content changes"
  );

  await writeArtifactIndex(repo);
  const fresh = await validateSealArtifacts(repo);
  assert.equal(fresh.valid, true);

  let tampered = await loadArtifactIndex(repo);
  delete tampered.artifacts[0].hash;
  await writeFile(path.join(repo, ".seal", "index.yaml"), stringifyArtifact(tampered), "utf8");
  let result = await validateArtifactIndex(repo);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "missing_hash"));

  await writeArtifactIndex(repo);
  tampered = await loadArtifactIndex(repo);
  tampered.records[0].relation_ids = ["src/missing.js"];
  await writeFile(path.join(repo, ".seal", "index.yaml"), stringifyArtifact(tampered), "utf8");
  result = await validateArtifactIndex(repo);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "dangling_index_ref"));

  await writeArtifactIndex(repo);
  await rm(path.join(repo, ".seal", "proof.yaml"), { force: true });
  result = await validateArtifactIndex(repo);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "missing_artifact"));

  const persisted = await readFile(path.join(repo, ".seal", "index.yaml"), "utf8");
  assert.match(persisted, /generated_artifact_index/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Artifact index records compact derived metadata, resolves records, and fails stale or broken references.");
