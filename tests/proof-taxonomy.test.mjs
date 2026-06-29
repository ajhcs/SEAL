import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAIM_EVIDENCE_TYPES,
  CLAIM_TYPES,
  validateProofTaxonomy
} from "../src/proof/taxonomy.mjs";
import { validateArtifact } from "../src/artifacts/schema-registry.mjs";
import { validateArtifactReferences } from "../src/artifacts/reference-integrity.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceId = "src.taxonomy";

const evidence = [];
const claims = CLAIM_TYPES.map((claimType) => {
  const evidenceType = CLAIM_EVIDENCE_TYPES[claimType][0];
  const claimId = `claim.taxonomy-${claimType}`;
  const evidenceId = `ev.taxonomy-${claimType}`;

  evidence.push({
    id: evidenceId,
    type: evidenceType,
    claim_ids: [claimId],
    status: "passed",
    captured_at: "2026-01-01T00:00:00.000Z",
    source: {
      kind: "static_inspection",
      summary: `Fixture ${claimType} evidence summary.`
    },
    artifact_path: `.seal/evidence/${claimType}.txt`,
    source_refs: [sourceId],
    redaction: "summary_only",
    limitations: "Fixture evidence proves taxonomy wiring, not real product behavior."
  });

  return {
    id: claimId,
    type: claimType,
    statement: `Fixture ${claimType} claim has an accepted evidence type.`,
    source_refs: [sourceId],
    evidence_refs: [evidenceId],
    gap_refs: []
  };
});

const map = {
  schema_version: "0.1.0",
  sources: [
    {
      id: sourceId,
      kind: "user_plan",
      authority_state: "provided",
      label: "Taxonomy fixture source"
    }
  ],
  components: [
    {
      id: "cmp.taxonomy",
      name: "Taxonomy fixture",
      source_refs: [sourceId],
      authority_state: "provided"
    }
  ],
  files: [
    {
      path: "README.md",
      classification: "documentation",
      component_id: "cmp.taxonomy",
      source_refs: [sourceId],
      authority_state: "provided"
    }
  ],
  gaps: []
};
const proof = { schema_version: "0.1.0", claims, gaps: [] };
const evidenceIndex = { schema_version: "0.1.0", evidence };

assert.equal((await validateArtifact("proof", proof)).valid, true);
assert.equal((await validateArtifact("evidenceIndex", evidenceIndex)).valid, true);
assert.equal(validateArtifactReferences({ map, proof, evidenceIndex }).valid, true);
assert.equal(validateProofTaxonomy(proof, evidenceIndex).valid, true);

const unsupported = {
  schema_version: "0.1.0",
  claims: [
    {
      id: "claim.unsupported",
      type: "performance",
      statement: "A performance claim cannot be proven only by human approval.",
      source_refs: [sourceId],
      evidence_refs: ["ev.unsupported"],
      gap_refs: []
    }
  ],
  gaps: []
};
const unsupportedEvidence = {
  schema_version: "0.1.0",
  evidence: [
    {
      id: "ev.unsupported",
      type: "human_approval",
      claim_ids: ["claim.unsupported"],
      status: "passed",
      captured_at: "2026-01-01T00:00:00.000Z",
      source: {
        kind: "human_review",
        summary: "Fixture unsupported evidence summary."
      },
      artifact_path: ".seal/evidence/approval.txt",
      source_refs: [sourceId],
      redaction: "summary_only",
      limitations: "Human approval does not measure performance."
    }
  ]
};
const invalidTaxonomy = validateProofTaxonomy(unsupported, unsupportedEvidence);
assert.equal(invalidTaxonomy.valid, false);
assert.equal(invalidTaxonomy.errors[0].code, "unsupported_evidence_type");

const doc = await readFile(path.join(root, "plugin", "docs", "proof-taxonomy.md"), "utf8");
for (const claimType of CLAIM_TYPES) {
  assert.ok(doc.includes(`\`${claimType}\``), `taxonomy doc should include ${claimType}`);
}

console.log("Proof taxonomy passed for all claim types and unsupported evidence detection.");
