import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateArtifact } from "../src/artifacts/schema-registry.mjs";
import { validateArtifactReferences } from "../src/artifacts/reference-integrity.mjs";
import {
  createEvidenceRecord,
  evidenceArtifactPath,
  validateEvidenceHashes,
  writeEvidenceArtifact
} from "../src/proof/evidence-store.mjs";
import { validateProofTaxonomy } from "../src/proof/taxonomy.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "seal-evidence-store-"));

try {
  const sourceId = "src.evidence-fixture";
  const capturedAt = "2026-01-01T00:00:00.000Z";
  const commandSummary = "summary: fixture test command passed\nraw_output: redacted\n";
  const staticSummary = "summary: inspected proof schema and evidence references\n";

  const map = {
    schema_version: "0.1.0",
    sources: [
      {
        id: sourceId,
        kind: "execution_evidence",
        authority_state: "execution_evidence",
        approval_state: "not_required",
        confidence: 1,
        label: "Evidence store fixture"
      }
    ],
    components: [
      {
        id: "cmp.evidence-store",
        name: "Evidence store fixture",
        source_refs: [sourceId],
        authority_state: "execution_evidence"
      }
    ],
    files: [
      {
        path: "tests/evidence-store.test.mjs",
        classification: "test",
        component_id: "cmp.evidence-store",
        source_refs: [sourceId],
        authority_state: "execution_evidence"
      }
    ],
    gaps: []
  };

  const proof = {
    schema_version: "0.1.0",
    claims: [
      {
        id: "claim.command-functional",
        type: "functional",
        statement: "Command output can prove functional behavior when linked to a claim.",
        source_refs: [sourceId],
        evidence_refs: ["ev.command-test"],
        gap_refs: []
      },
      {
        id: "claim.static-security",
        type: "security",
        statement: "Static inspection can support a security claim.",
        source_refs: [sourceId],
        evidence_refs: ["ev.static-inspection"],
        gap_refs: []
      },
      {
        id: "claim.external-usability",
        type: "usability",
        statement: "External references can support usability claims.",
        source_refs: [sourceId],
        evidence_refs: ["ev.external-reference"],
        gap_refs: []
      },
      {
        id: "claim.human-launch",
        type: "launch",
        statement: "Human approval can support launch claims.",
        source_refs: [sourceId],
        evidence_refs: ["ev.human-approval"],
        gap_refs: []
      }
    ],
    gaps: []
  };

  const commandEvidence = createEvidenceRecord({
    id: "ev.command-test",
    type: "command_output",
    claimIds: ["claim.command-functional"],
    sourceKind: "command",
    sourceRefs: [sourceId],
    command: "npm test",
    summary: "Fixture command output summary; raw command output is not stored.",
    artifactPath: evidenceArtifactPath("ev.command-test"),
    artifactContent: commandSummary,
    limitations: "Fixture command summary proves evidence storage behavior, not product correctness.",
    capturedAt
  });
  const staticEvidence = createEvidenceRecord({
    id: "ev.static-inspection",
    type: "static_inspection",
    claimIds: ["claim.static-security"],
    sourceKind: "static_inspection",
    sourceRefs: [sourceId],
    summary: "Fixture static inspection summary.",
    artifactPath: evidenceArtifactPath("ev.static-inspection"),
    artifactContent: staticSummary,
    limitations: "Static fixture covers schema/reference wiring only.",
    capturedAt
  });
  const externalEvidence = createEvidenceRecord({
    id: "ev.external-reference",
    type: "external_reference",
    claimIds: ["claim.external-usability"],
    sourceKind: "external_source",
    sourceRefs: [sourceId],
    sourceRef: "https://example.invalid/usability-source",
    summary: "Fixture external source reference.",
    limitations: "External source is a fixture URL and is not fetched.",
    capturedAt
  });
  const humanEvidence = createEvidenceRecord({
    id: "ev.human-approval",
    type: "human_approval",
    claimIds: ["claim.human-launch"],
    sourceKind: "human_review",
    sourceRefs: [sourceId],
    summary: "Fixture reviewer approved the launch claim.",
    limitations: "Human approval is scoped to this fixture only.",
    capturedAt
  });

  await writeEvidenceArtifact(root, commandEvidence, commandSummary);
  await writeEvidenceArtifact(root, staticEvidence, staticSummary);

  const evidenceIndex = {
    schema_version: "0.1.0",
    evidence: [commandEvidence, staticEvidence, externalEvidence, humanEvidence]
  };

  assert.equal(commandEvidence.redaction, "summary_only");
  assert.equal(externalEvidence.redaction, "not_applicable");
  assert.equal((await validateArtifact("proof", proof)).valid, true);
  assert.equal((await validateArtifact("evidenceIndex", evidenceIndex)).valid, true);
  assert.equal(validateArtifactReferences({ map, proof, evidenceIndex }).valid, true);
  assert.equal(validateProofTaxonomy(proof, evidenceIndex).valid, true);
  assert.equal((await validateEvidenceHashes(root, evidenceIndex)).valid, true);

  await writeFile(path.join(root, commandEvidence.artifact_path), "tampered\n", "utf8");
  const tampered = await validateEvidenceHashes(root, evidenceIndex);
  assert.equal(tampered.valid, false);
  assert.equal(tampered.errors[0].code, "artifact_hash_mismatch");
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Evidence store preserves provenance, redaction, claim links, and artifact hashes.");
