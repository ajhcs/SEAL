import assert from "node:assert/strict";
import { validateArtifactReferences } from "../src/artifacts/reference-integrity.mjs";
import { validateArtifact } from "../src/artifacts/schema-registry.mjs";
import { createImpactRecord } from "../src/impact/change-scope.mjs";

const map = {
  schema_version: "0.1.0",
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
      purpose: "Unit validation for checkout behavior."
    },
    {
      path: "tests/checkout.integration.test.js",
      classification: "test",
      component_id: "cmp.checkout",
      source_refs: ["src.checkout-plan"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.9,
      purpose: "Integration validation for checkout behavior."
    },
    {
      path: "docs/checkout.md",
      classification: "documentation",
      component_id: "cmp.checkout",
      source_refs: ["src.checkout-plan"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.8,
      purpose: "Checkout operator notes."
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
  schema_version: "0.1.0",
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

const proofRequired = new Map(impact.proof_required.map((record) => [`${record.affected_kind}:${record.affected_id}`, record]));
assert.equal(proofRequired.get("test:tests/checkout.test.js").evidence_type, "test_result");
assert.equal(proofRequired.get("test:tests/checkout.integration.test.js").validation_method, "command");
assert.match(proofRequired.get("test:tests/checkout.integration.test.js").action, /Run the affected test file/);
assert.equal(proofRequired.get("schema:plugin/schemas/checkout.schema.json").evidence_type, "static_inspection");
assert.equal(proofRequired.get("file:docs/checkout.md").validation_method, "static_review");
assert.equal(proofRequired.get("requirement:req.checkout").validation_method, "manual_validation");
assert.equal(proofRequired.get("risk:risk.fraud").evidence_type, "human_approval");

const proofClaimObligation = proofRequired.get("proof:claim.checkout-launch-safe");
assert.equal(proofClaimObligation.claim_id, "claim.checkout-launch-safe");
assert.equal(proofClaimObligation.status, "gapped");
assert.equal(proofClaimObligation.gap_id, "gap.checkout-evidence");

const unknownServiceObligation = impact.proof_required.find((record) => record.id === "proof.unknown.service");
assert.equal(unknownServiceObligation.evidence_type, "gap_record");
assert.equal(unknownServiceObligation.status, "gapped");
assert.equal(unknownServiceObligation.gap_id, "gap.impact.service");

const approvals = new Map(impact.approval_needed.map((record) => [`${record.affected_kind}:${record.affected_id}`, record]));
assert.equal(approvals.get("gate:gate.launch").approver, "launch_owner");
assert.equal(approvals.get("risk:risk.fraud").approver, "risk_owner");

const unknownServiceApproval = impact.approval_needed.find((record) => record.id === "approval.unknown.service");
assert.equal(unknownServiceApproval.approver, "authority_owner");
assert.equal(unknownServiceApproval.gap_id, "gap.impact.service");

assert.equal(new Set(impact.proof_required.map((record) => record.id)).size, impact.proof_required.length);
assert.equal(new Set(impact.approval_needed.map((record) => record.id)).size, impact.approval_needed.length);

console.log("Impact proof obligation tests passed.");
