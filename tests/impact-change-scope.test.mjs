import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import YAML from "yaml";
import { validateArtifactReferences } from "../src/artifacts/reference-integrity.mjs";
import { validateArtifact } from "../src/artifacts/schema-registry.mjs";
import { stringifyArtifact } from "../src/artifacts/generate.mjs";
import { CONTRACT_SCHEMA_VERSION } from "../src/contracts/constants.mjs";
import { createImpactRecord, writeImpactRecord } from "../src/impact/change-scope.mjs";

const map = {
  schema_version: CONTRACT_SCHEMA_VERSION,
  sources: [
    {
      id: "src.checkout-plan",
      kind: "repo_observation",
      authority_state: "repo_observed",
      approval_state: "not_required",
      confidence: 1,
      label: "Checkout implementation",
      plain_language: "Repository checkout files and mapped launch records."
    }
  ],
  components: [
    {
      id: "cmp.checkout",
      name: "Checkout",
      source_refs: ["src.checkout-plan"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.9,
      purpose: "Handle customer checkout."
    }
  ],
  files: [
    {
      path: "src/checkout.js",
      classification: "product_code",
      component_id: "cmp.checkout",
      source_refs: ["src.checkout-plan"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.9,
      purpose: "Checkout runtime."
    },
    {
      path: "tests/checkout.test.js",
      classification: "test",
      component_id: "cmp.checkout",
      source_refs: ["src.checkout-plan"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.9,
      purpose: "Checkout behavior validation."
    },
    {
      path: "plugin/schemas/checkout.schema.json",
      classification: "config",
      component_id: "cmp.checkout",
      source_refs: ["src.checkout-plan"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.8,
      purpose: "Checkout payload schema."
    }
  ],
  gaps: [],
  requirements: [
    {
      id: "req.checkout",
      statement: "Checkout must complete with validated payment and order data.",
      source_refs: ["src.checkout-plan"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.8
    }
  ],
  risks: [
    {
      id: "risk.fraud",
      summary: "Payment changes can weaken fraud checks.",
      source_refs: ["src.checkout-plan"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.7
    }
  ],
  trace_links: [
    {
      id: "trace.checkout-component",
      from_id: "req.checkout",
      to_id: "cmp.checkout",
      relationship: "implements",
      source_refs: ["src.checkout-plan"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.8
    },
    {
      id: "trace.checkout-risk",
      from_id: "req.checkout",
      to_id: "risk.fraud",
      relationship: "mitigates",
      source_refs: ["src.checkout-plan"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.7
    },
    {
      id: "trace.checkout-gate",
      from_id: "req.checkout",
      to_id: "gate.launch",
      relationship: "gates",
      source_refs: ["src.checkout-plan"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.8
    }
  ],
  launch_gates: [
    {
      id: "gate.launch",
      name: "Launch checkout",
      condition: "Checkout impact and proof must be reviewed before launch.",
      source_refs: ["src.checkout-plan"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.8
    }
  ]
};

const proof = {
  schema_version: CONTRACT_SCHEMA_VERSION,
  claims: [
    {
      id: "claim.checkout-launch-safe",
      type: "launch",
      statement: "Checkout can launch after impact and evidence review.",
      source_refs: ["src.checkout-plan"],
      evidence_refs: [],
      gap_refs: ["gap.checkout-evidence"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.6
    }
  ],
  gaps: [
    {
      id: "gap.checkout-evidence",
      summary: "Checkout launch proof still needs current command evidence.",
      reason: "Launch proof must attach evidence after changes.",
      source_refs: ["src.checkout-plan"],
      authority_state: "repo_observed",
      approval_state: "not_required",
      confidence: 0.8,
      status: "open"
    }
  ]
};

const impact = createImpactRecord({
  map,
  proof,
  change: {
    target: "src/checkout.js",
    summary: "Change checkout payment flow.",
    source_refs: ["src.checkout-plan"]
  }
});

assert.equal((await validateArtifact("impact", impact)).valid, true);
assert.equal(validateArtifactReferences({ map, proof, impact }).valid, true);

const affected = new Map(impact.affected_flat.map((record) => [`${record.kind}:${record.ref ?? record.id}`, record]));
for (const expected of [
  "file:src/checkout.js",
  "test:tests/checkout.test.js",
  "schema:plugin/schemas/checkout.schema.json",
  "component:cmp.checkout",
  "requirement:req.checkout",
  "risk:risk.fraud",
  "gate:gate.launch",
  "proof:claim.checkout-launch-safe"
]) {
  assert.ok(affected.has(expected), `${expected} should be affected`);
  assert.ok(affected.get(expected).reason.length > 0, `${expected} should explain why it is affected`);
}

for (const category of ["interface", "invariant", "service", "dependency", "cost"]) {
  assert.ok(
    impact.affected_flat.some((record) => record.kind === "unknown" && record.category === category),
    `${category} uncertainty should be recorded as an unknown impact`
  );
  assert.ok(
    impact.gaps.some((gap) => gap.id === `gap.impact.${category}`),
    `${category} gap should be recorded`
  );
}

assert.deepEqual(
  impact.proof_needed.map((proofNeed) => proofNeed.claim_id),
  ["claim.checkout-launch-safe"]
);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "seal-impact-"));
try {
  await mkdir(path.join(tempRoot, ".seal"), { recursive: true });
  await writeFile(path.join(tempRoot, ".seal", "map.yaml"), stringifyArtifact(map), "utf8");
  await writeFile(path.join(tempRoot, ".seal", "proof.yaml"), stringifyArtifact(proof), "utf8");

  const { outputPath } = await writeImpactRecord(tempRoot, {
    target: "src/checkout.js",
    summary: "Change checkout payment flow.",
    source_refs: ["src.checkout-plan"]
  });
  const written = YAML.parse(await readFile(outputPath, "utf8"));
  assert.equal(written.id, "IMPACT-change-checkout-payment-flow");
  assert.equal((await validateArtifact("impact", written)).valid, true);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Impact change scope tests passed.");
