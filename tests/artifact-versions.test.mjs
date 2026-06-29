import assert from "node:assert/strict";
import {
  CURRENT_ARTIFACT_SCHEMA_VERSION,
  evaluateArtifactVersion
} from "../src/artifacts/versions.mjs";

const current = evaluateArtifactVersion("map", { schema_version: CURRENT_ARTIFACT_SCHEMA_VERSION });
assert.equal(current.valid, true, "current artifact schema version should pass");
assert.deepEqual(current.diagnostics, []);

const old = evaluateArtifactVersion("map", { schema_version: "0.0.0" });
assert.equal(old.valid, false, "older artifact schema version should fail until migrated");
assert.equal(old.diagnostics[0].path, "/schema_version");
assert.match(old.diagnostics[0].message, /older than supported 0\.1\.0/);
assert.match(old.diagnostics[0].fix, /plugin\/docs\/migration-policy\.md/);

const future = evaluateArtifactVersion("proof", { schema_version: "9.0.0" });
assert.equal(future.valid, false, "future artifact schema version should require a newer SEAL build");
assert.match(future.diagnostics[0].message, /newer than this SEAL build/);
assert.match(future.diagnostics[0].fix, /Upgrade SEAL/);

const malformed = evaluateArtifactVersion("impact", { schema_version: "draft" });
assert.equal(malformed.valid, false, "malformed schema_version should fail with an actionable diagnostic");
assert.match(malformed.diagnostics[0].fix, /semantic x\.y\.z/);

const missing = evaluateArtifactVersion("map", {});
assert.equal(missing.valid, true, "missing schema_version is left to JSON schema required-field checks");

console.log("Artifact version policy rejects mismatched schema versions with migration guidance.");
