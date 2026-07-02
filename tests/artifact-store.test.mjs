import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createMinimalArtifactSet, stringifyArtifact } from "../src/artifacts/generate.mjs";
import { createArtifactStore, ARTIFACT_WRITE_AUDIT_PATH } from "../src/artifacts/store.mjs";

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-artifact-store-"));

try {
  const artifacts = createMinimalArtifactSet();
  const store = createArtifactStore(tempRoot, { now: () => "2026-07-02T00:00:00.000Z" });

  await mkdir(path.join(tempRoot, ".seal"), { recursive: true });
  await writeFile(store.pathFor("map"), "human edited map\n", "utf8");
  const preserved = await store.writeCanonical("map", artifacts.map, { reason: "test_preserve" });
  assert.equal(preserved.written, false);
  assert.equal(await readFile(store.pathFor("map"), "utf8"), "human edited map\n");

  await store.writeDerived("launchReadiness", "first report\n", { reason: "test_report" });
  await store.writeDerived("launchReadiness", "second report\n", { reason: "test_report" });
  assert.equal(await readFile(store.pathFor("launchReadiness"), "utf8"), "second report\n");

  await mkdir(path.join(tempRoot, ".seal", "impacts"), { recursive: true });
  await writeFile(path.join(tempRoot, ".seal", "impacts", "IMPACT-bad.yaml"), "id: [bad\n", "utf8");
  const diagnosticRead = await store.readCanonicalSet({ validate: true, mode: "diagnostic" });
  assert.equal(diagnosticRead.artifactSet.impacts.length, 0);
  assert.ok(diagnosticRead.diagnostics.some((diagnostic) =>
    diagnostic.artifactType === "impact" &&
    diagnostic.severity === "warning" &&
    diagnostic.message.includes("Flow sequence")
  ));

  const keyedFailFastRead = await store.readCanonicalSet({
    keys: ["sources"],
    validate: true,
    mode: "fail-fast"
  });
  assert.equal(keyedFailFastRead.artifactSet.sources, undefined, "keyed reads must not inspect unrequested artifacts");

  await assert.rejects(
    () => store.readCanonicalSet({ keys: ["impact"], validate: true, mode: "fail-fast" }),
    /Flow sequence/
  );

  await mkdir(path.join(tempRoot, ".seal", "fly"), { recursive: true });
  await writeFile(path.join(tempRoot, ".seal", "fly", `${artifacts.fly.id}.yaml`), stringifyArtifact(artifacts.fly), "utf8");
  const repeatedRead = await store.readCanonicalSet({ keys: ["fly"], validate: true, mode: "fail-fast" });
  assert.equal(repeatedRead.artifactSet.flyRecords.length, 1);
  assert.equal(repeatedRead.artifactSet.flyRecords[0].id, artifacts.fly.id);

  await store.writeCanonical("proof", artifacts.proof, { reason: "test_create" });
  const auditPath = path.join(tempRoot, ARTIFACT_WRITE_AUDIT_PATH);
  const audit = (await readFile(auditPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.ok(audit.some((record) => record.kind === "canonical" && record.action === "preserved" && record.path === ".seal/map.yaml"));
  assert.ok(audit.some((record) => record.kind === "derived" && record.action === "overwritten" && record.path === ".seal/reports/launch-readiness.md"));
  assert.ok(audit.some((record) => record.kind === "canonical" && record.action === "created" && record.path === ".seal/proof.yaml"));

  const requiredStore = createArtifactStore(await mkdtemp(path.join(tempRoot, "missing-")));
  await assert.rejects(
    () => requiredStore.readCanonical("map", { required: true, mode: "fail-fast" }),
    /ENOENT|no such file/i
  );

  const yaml = stringifyArtifact(artifacts.map);
  assert.match(yaml, /schema_version/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("ArtifactStore passed for canonical preservation, derived overwrites, diagnostics, and audit records.");
