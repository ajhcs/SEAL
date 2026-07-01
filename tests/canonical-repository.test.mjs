import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CanonicalArtifactSetError, loadCanonicalArtifactSet } from "../src/artifacts/canonical-repository.mjs";
import { invokeSeal } from "../src/invocation/invoke.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function createRepo(root) {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "README.md"), "# Canonical repo\n", "utf8");
  await writeFile(path.join(root, "package.json"), "{\"type\":\"module\"}\n", "utf8");
}

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-canonical-repo-"));

try {
  const repoRoot = path.join(tempRoot, "repo");
  await createRepo(repoRoot);
  await invokeSeal(repoRoot);

  const set = await loadCanonicalArtifactSet(repoRoot);
  assert.equal(set.authority, "canonical");
  assert.equal(set.source, "disk");
  assert.ok(set.paths.includes(".seal/map.yaml"));
  assert.ok(!set.paths.includes(".seal/index.yaml"));
  assert.ok(!set.paths.includes(".seal/context-pack.yaml"));

  const mapRaw = await readFile(path.join(repoRoot, ".seal", "map.yaml"));
  const mapEntry = set.getByPath(".seal/map.yaml");
  assert.equal(mapEntry.hash, sha256(mapRaw));
  assert.equal(mapEntry.bytes, mapRaw.length);
  assert.equal(mapEntry.id, "artifact.map");
  assert.equal(set.getById(mapEntry.id).path, ".seal/map.yaml");

  await rm(path.join(repoRoot, ".seal", "proof.yaml"));
  await assert.rejects(
    () => loadCanonicalArtifactSet(repoRoot),
    (error) => error instanceof CanonicalArtifactSetError
      && error.diagnostics.some((diagnostic) => diagnostic.code === "missing_canonical_artifact"
        && diagnostic.path === ".seal/proof.yaml")
  );

  const invalidRoot = path.join(tempRoot, "invalid");
  await createRepo(invalidRoot);
  await invokeSeal(invalidRoot);
  await writeFile(path.join(invalidRoot, ".seal", "map.yaml"), "id: map.invalid\nkind: map\nschema_version: 0.2.0\n", "utf8");
  await assert.rejects(
    () => loadCanonicalArtifactSet(invalidRoot),
    (error) => error instanceof CanonicalArtifactSetError
      && error.diagnostics.some((diagnostic) => diagnostic.code === "invalid_canonical_artifact"
        && diagnostic.path === ".seal/map.yaml")
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Canonical repository loads disk authority, records hashes, and rejects missing or invalid canonical artifacts.");
