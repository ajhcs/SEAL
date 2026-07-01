import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";

import { createMinimalArtifactSet, stringifyArtifact } from "../src/artifacts/generate.mjs";
import { createArtifactIndex, resolveArtifactRecords, writeArtifactIndex } from "../src/artifacts/index.mjs";

const artifactSet = createMinimalArtifactSet();
const index = createArtifactIndex(artifactSet);

assert.ok(index.generated_from.includes(".seal/map.yaml"));
assert.ok(index.generated_from.includes(".seal/proof.yaml"));
assert.ok(index.notice.includes("Generated from .seal/*.yaml"));
assert.ok(index.records.some((record) => record.kind === "component" && record.id === "cmp.generated"));
assert.ok(index.records.some((record) => record.kind === "file" && record.id === "README.md"));
assert.ok(index.records.some((record) => record.id === "gap.generated-proof" && record.json_pointer === "/unknowns/0"));
assert.ok(index.records.some((record) => record.id === "impact.generated-component" && record.json_pointer === "/affected/components/0"));
assert.ok(index.records.every((record) => record.hash && record.source_refs.length > 0));
assert.equal(resolveArtifactRecords(index, { id: "cmp.generated", kind: "component" }).length, 1);
assert.equal(resolveArtifactRecords(index, { path: "README.md", kind: "file" }).length, 1);

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-artifact-index-"));
try {
  const sealRoot = path.join(tempRoot, ".seal");
  await mkdir(path.join(sealRoot, "evidence"), { recursive: true });
  await writeFile(path.join(tempRoot, "README.md"), "# index fixture\n", "utf8");
  await writeFile(path.join(sealRoot, "ontology.yaml"), stringifyArtifact(artifactSet.ontology), "utf8");
  await writeFile(path.join(sealRoot, "map.yaml"), stringifyArtifact(artifactSet.map), "utf8");
  await writeFile(path.join(sealRoot, "proof.yaml"), stringifyArtifact(artifactSet.proof), "utf8");
  await writeFile(path.join(sealRoot, "evidence", "index.yaml"), stringifyArtifact(artifactSet.evidenceIndex), "utf8");
  const { outputPath } = await writeArtifactIndex(tempRoot);
  await stat(outputPath);
  const written = YAML.parse(await readFile(outputPath, "utf8"));
  assert.ok(written.records.some((record) => record.artifact_path === ".seal/proof.yaml"));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Artifact index records canonical artifact refs and resolves compact lookup queries.");
