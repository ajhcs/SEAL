import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { stringifyArtifact } from "../src/artifacts/generate.mjs";
import { CONTRACT_SCHEMA_VERSION, CONTEXT_PACK_BUDGET } from "../src/contracts/constants.mjs";
import { createContextPack, writeContextPack } from "../src/context/pack.mjs";

const source = {
  id: "src.context.repo",
  kind: "repo_observation",
  label: "Context pack fixture",
  authority_state: "repo_observed",
  approval_state: "approved",
  confidence: 1,
};

const map = {
  schema_version: CONTRACT_SCHEMA_VERSION,
  sources: [source],
  components: [
    {
      id: "cmp.checkout",
      name: "Checkout",
      purpose: "Accept customer checkout requests.",
      source_files: ["src/checkout.js", "tests/checkout.test.js"],
      interfaces: ["checkoutApi"],
      tests: ["tests/checkout.test.js"],
      source_refs: ["src.context.repo"],
      authority_state: "repo_observed",
      approval_state: "approved",
      confidence: 0.95,
    },
    {
      id: "cmp.admin",
      name: "Admin",
      purpose: "Manage back-office operations.",
      source_files: ["src/admin.js", "tests/admin.test.js"],
      interfaces: ["adminApi"],
      tests: ["tests/admin.test.js"],
      source_refs: ["src.context.repo"],
      authority_state: "repo_observed",
      approval_state: "approved",
      confidence: 0.9,
    },
  ],
  files: [
    {
      path: "src/checkout.js",
      classification: "product_code",
      component_id: "cmp.checkout",
      purpose: "Checkout implementation.",
      interfaces_touched: ["checkoutApi"],
      tests: ["tests/checkout.test.js"],
      source_refs: ["src.context.repo"],
      authority_state: "repo_observed",
      approval_state: "approved",
      confidence: 0.95,
    },
    {
      path: "tests/checkout.test.js",
      classification: "test",
      component_id: "cmp.checkout",
      purpose: "Checkout test.",
      source_refs: ["src.context.repo"],
      authority_state: "repo_observed",
      approval_state: "approved",
      confidence: 0.95,
    },
    {
      path: "src/admin.js",
      classification: "product_code",
      component_id: "cmp.admin",
      purpose: "Admin implementation.",
      interfaces_touched: ["adminApi"],
      tests: ["tests/admin.test.js"],
      source_refs: ["src.context.repo"],
      authority_state: "repo_observed",
      approval_state: "approved",
      confidence: 0.9,
    },
    {
      path: "tests/admin.test.js",
      classification: "test",
      component_id: "cmp.admin",
      purpose: "Admin test.",
      source_refs: ["src.context.repo"],
      authority_state: "repo_observed",
      approval_state: "approved",
      confidence: 0.9,
    },
  ],
  gaps: [],
};

const proof = {
  schema_version: CONTRACT_SCHEMA_VERSION,
  claims: [
    {
      id: "claim.checkout-safe",
      type: "functional",
      statement: "Checkout remains safe after the proposed change.",
      source_refs: ["src.context.repo"],
      evidence_refs: ["ev.checkout-test"],
      gap_refs: [],
      authority_state: "repo_observed",
      approval_state: "approved",
      confidence: 0.9,
    },
    {
      id: "claim.admin-safe",
      type: "functional",
      statement: "Admin remains safe.",
      source_refs: ["src.context.repo"],
      evidence_refs: ["ev.admin-test"],
      gap_refs: [],
      authority_state: "repo_observed",
      approval_state: "approved",
      confidence: 0.9,
    },
  ],
  gaps: [],
};

const evidenceIndex = {
  schema_version: CONTRACT_SCHEMA_VERSION,
  evidence: [
    {
      id: "ev.checkout-test",
      type: "test_result",
      claim_ids: ["claim.checkout-safe"],
      status: "passed",
      captured_at: "2026-01-01T00:00:00.000Z",
      source: { kind: "command", command: "node tests/checkout.test.js" },
      source_refs: ["src.context.repo"],
      limitations: "Fixture evidence.",
      redaction: "summary_only",
      authority_state: "execution_evidence",
      approval_state: "approved",
      confidence: 1,
    },
    {
      id: "ev.admin-test",
      type: "test_result",
      claim_ids: ["claim.admin-safe"],
      status: "passed",
      captured_at: "2026-01-01T00:00:00.000Z",
      source: { kind: "command", command: "node tests/admin.test.js" },
      source_refs: ["src.context.repo"],
      limitations: "Fixture evidence.",
      redaction: "summary_only",
      authority_state: "execution_evidence",
      approval_state: "approved",
      confidence: 1,
    },
  ],
};

const impact = {
  schema_version: CONTRACT_SCHEMA_VERSION,
  id: "IMPACT-checkout",
  change: {
    target: "src/checkout.js",
    summary: "Change checkout.",
    source_refs: ["src.context.repo"],
    authority_state: "repo_observed",
    approval_state: "pending",
    confidence: 0.8,
  },
  affected: [
    { kind: "file", id: "src/checkout.js", reason: "Direct change.", source_refs: ["src.context.repo"], authority_state: "repo_observed", approval_state: "pending", confidence: 0.9 },
    { kind: "component", id: "cmp.checkout", reason: "Owning component.", source_refs: ["src.context.repo"], authority_state: "repo_observed", approval_state: "pending", confidence: 0.9 },
    { kind: "test", id: "tests/checkout.test.js", reason: "Regression coverage.", source_refs: ["src.context.repo"], authority_state: "repo_observed", approval_state: "pending", confidence: 0.9 },
  ],
  proof_required: [
    {
      id: "proofreq.checkout",
      claim_id: "claim.checkout-safe",
      reason: "Checkout proof must stay current.",
      status: "open",
    },
  ],
  proof_needed: [],
  approval_needed: [],
  gaps: [],
};

const pack = createContextPack({
  map,
  proof,
  evidenceIndex,
  impacts: [impact],
  change: { target: "src/checkout.js", summary: "Change checkout." },
});

assert.deepEqual(pack.scope.components.map((record) => record.id), ["cmp.checkout"]);
assert.deepEqual(pack.scope.files.map((record) => record.path), ["src/checkout.js", "tests/checkout.test.js"]);
assert.deepEqual(pack.scope.tests.map((record) => record.path), ["tests/checkout.test.js"]);
assert.deepEqual(pack.scope.claims.map((record) => record.id), ["claim.checkout-safe"]);
assert.deepEqual(pack.scope.evidence.map((record) => record.id), ["ev.checkout-test"]);
assert.equal(pack.slices.interfaces.some((record) => record.name === "checkoutApi"), true);
assert.equal(pack.scope.files.some((record) => record.path === "src/admin.js"), false);
assert.equal(pack.scope.claims.some((record) => record.id === "claim.admin-safe"), false);
assert.equal(pack.scope.evidence.some((record) => record.id === "ev.admin-test"), false);
assert.equal(pack.slices.components[0].authority_state, "repo_observed");
assert.equal(pack.slices.evidence[0].authority_state, "execution_evidence");
assert.ok(pack.omitted_counts.files >= 2);
assert.ok(pack.excluded.length <= CONTEXT_PACK_BUDGET.max_records.files);
assert.equal(pack.ontology.record_counts.components, 2);
assert.match(pack.guardrails.join("\n"), /inferred or unknown records/);
assert.ok(pack.actual_bytes <= CONTEXT_PACK_BUDGET.max_bytes, `context pack should fit budget, got ${pack.actual_bytes}`);

const bloatedMap = structuredClone(map);
bloatedMap.components[0].source_files = Array.from({ length: 200 }, (_, index) => `src/generated-${index}.js`);
bloatedMap.components[0].source_files.push("src/checkout.js", "tests/checkout.test.js");
bloatedMap.dependencies = Array.from({ length: 200 }, (_, index) => ({
  id: `dep.generated-${index}`,
  name: `dependency-${index}`,
  file: "src/checkout.js",
  owner_component_id: "cmp.checkout",
  source_refs: ["src.context.repo"],
  authority_state: "repo_observed",
  approval_state: "not_required",
  confidence: 0.8,
}));
const bloatedPack = createContextPack({
  map: bloatedMap,
  proof,
  evidenceIndex,
  impacts: [impact],
  change: { target: "src/checkout.js", summary: "Change checkout." },
});
assert.ok(bloatedPack.actual_bytes <= CONTEXT_PACK_BUDGET.max_bytes, `bloated pack should fit budget, got ${bloatedPack.actual_bytes}`);
assert.equal(bloatedPack.scope.dependencies.length, CONTEXT_PACK_BUDGET.max_records.files);
assert.deepEqual(bloatedPack.slices.components[0].selected_files, ["src/checkout.js", "tests/checkout.test.js"]);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "seal-context-pack-"));
try {
  await mkdir(path.join(tempRoot, ".seal", "impacts"), { recursive: true });
  await mkdir(path.join(tempRoot, ".seal", "evidence"), { recursive: true });
  await writeFile(path.join(tempRoot, ".seal", "map.yaml"), stringifyArtifact(map), "utf8");
  await writeFile(path.join(tempRoot, ".seal", "proof.yaml"), stringifyArtifact(proof), "utf8");
  await writeFile(path.join(tempRoot, ".seal", "evidence", "index.yaml"), stringifyArtifact(evidenceIndex), "utf8");
  await writeFile(path.join(tempRoot, ".seal", "impacts", "IMPACT-checkout.yaml"), stringifyArtifact(impact), "utf8");

  const { reportPath } = await writeContextPack(tempRoot, {
    target: "src/checkout.js",
    summary: "Change checkout.",
  });
  const written = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(written.scope.files.some((record) => record.path === "src/admin.js"), false);
  assert.equal(written.scope.claims[0].proof_status, "proven");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Context pack builder selects relevant MAP, IMPACT, PROVE, evidence, and gap records without unrelated files.");
