import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMinimalArtifactSet } from "../src/artifacts/generate.mjs";
import { validateAuthority } from "../src/artifacts/authority.mjs";
import { formatValidationReport, validateSealArtifacts } from "../src/validation/validate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const allowedAuthorityStates = [
  "human_approved",
  "repo_observed",
  "externally_sourced",
  "execution_evidence",
  "mathematically_proven",
  "inferred",
  "unknown"
];

const fixtureSet = createMinimalArtifactSet();
fixtureSet.map.sources = allowedAuthorityStates.map((authorityState) => ({
  id: `src.${authorityState}`,
  kind: authorityState === "inferred" ? "inference" : "fixture",
  authority_state: authorityState,
  approval_state: "not_required",
  confidence: authorityState === "unknown" ? 0 : 0.8,
  label: `Authority fixture for ${authorityState}`
}));

const allowedResult = validateAuthority(fixtureSet);
assert.equal(allowedResult.valid, true, `all source authority states should be registrable: ${JSON.stringify(allowedResult.errors)}`);

const weakApprovedSet = createMinimalArtifactSet();
weakApprovedSet.map.sources[0].authority_state = "inferred";
weakApprovedSet.map.sources[0].approval_state = "not_required";
weakApprovedSet.map.components[0].authority_state = "inferred";
weakApprovedSet.map.components[0].approval_state = "approved";
const weakApprovedResult = validateAuthority(weakApprovedSet);
assert.equal(weakApprovedResult.valid, false, "approved baseline records cannot rely on inferred authority");
assert.ok(weakApprovedResult.errors.some((error) => error.code === "approved_weak_authority"));
assert.ok(weakApprovedResult.errors.some((error) => error.code === "approved_weak_sources"));

const validFixtureResult = await validateSealArtifacts(path.join(root, "plugin", "fixtures", "minimal"));
assert.equal(validFixtureResult.valid, true, formatValidationReport(validFixtureResult));

console.log("Authority validation passed for source registry states and approved weak-authority failures.");
