import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { validateArtifact } from "../src/artifacts/schema-registry.mjs";
import { validateArtifactReferences } from "../src/artifacts/reference-integrity.mjs";
import { CONTRACT_SCHEMA_VERSION } from "../src/contracts/constants.mjs";
import { createProofGapReport, writeProofGapReport } from "../src/proof/gap-report.mjs";

const sourceId = "src.proof-report-fixture";
function claim(overrides) {
  return {
    subject: overrides.id,
    ontology_type: "claim",
    ontology_id: overrides.id,
    object_refs: ["cmp.proof-report"],
    status: overrides.evidence_refs?.length > 0 ? "proven" : "gapped",
    counterevidence_refs: [],
    limitations: ["Fixture claim only; not product proof."],
    freshness: {
      status: "current",
      checked_at: "2026-01-01T00:00:00.000Z",
      basis: "Fixture evidence timestamp."
    },
    confidence: 0.8,
    ...overrides
  };
}

const map = {
  schema_version: CONTRACT_SCHEMA_VERSION,
  sources: [
    {
      id: sourceId,
      kind: "command_execution",
      label: "Proof report fixture",
      authority_state: "execution_evidence",
      approval_state: "not_required",
      confidence: 1
    }
  ],
  components: [
    {
      id: "cmp.proof-report",
      name: "Proof report fixture",
      source_refs: [sourceId],
      authority_state: "execution_evidence"
    }
  ],
  files: [
    {
      path: "tests/proof-gap-report.test.mjs",
      classification: "test",
      component_id: "cmp.proof-report",
      source_refs: [sourceId],
      authority_state: "execution_evidence"
    }
  ],
  gaps: []
};

const proof = {
  schema_version: CONTRACT_SCHEMA_VERSION,
  claims: [
    claim({
      id: "claim.proven",
      type: "functional",
      statement: "A passed test result proves the fixture behavior.",
      source_refs: [sourceId],
      evidence_refs: ["ev.proven"],
      gap_refs: []
    }),
    claim({
      id: "claim.blocked-gap",
      type: "launch",
      status: "gapped",
      statement: "Launch is blocked until a human decision is recorded.",
      source_refs: [sourceId],
      evidence_refs: [],
      gap_refs: ["gap.launch-approval"],
      freshness: {
        status: "unknown",
        checked_at: "2026-01-01T00:00:00.000Z",
        basis: "Human launch decision is missing."
      },
      confidence: 0.5
    }),
    claim({
      id: "claim.assumed",
      type: "operational",
      status: "gapped",
      statement: "An accepted gap is visible as an assumption.",
      source_refs: [sourceId],
      evidence_refs: [],
      gap_refs: ["gap.accepted-ops"],
      confidence: 0.7
    }),
    claim({
      id: "claim.failed",
      type: "security",
      status: "rejected",
      statement: "Failed static inspection blocks a security claim.",
      source_refs: [sourceId],
      evidence_refs: ["ev.failed"],
      gap_refs: []
    }),
    claim({
      id: "claim.stale",
      type: "performance",
      status: "stale",
      statement: "Stale performance evidence must be refreshed.",
      source_refs: [sourceId],
      evidence_refs: ["ev.stale"],
      gap_refs: [],
      freshness: {
        status: "stale",
        checked_at: "2026-01-01T00:00:00.000Z",
        basis: "Evidence was captured in 2025."
      }
    }),
    claim({
      id: "claim.invalid",
      type: "performance",
      statement: "Human approval alone is invalid performance proof.",
      source_refs: [sourceId],
      evidence_refs: ["ev.unsupported"],
      gap_refs: []
    })
  ],
  evidence: [],
  gaps: [
    {
      id: "gap.launch-approval",
      ontology_type: "gap",
      ontology_id: "gap.launch-approval",
      object_refs: ["claim.blocked-gap"],
      missing: "Human launch approval evidence.",
      closure_method: "Record human launch approval or leave launch blocked.",
      blocks: ["claim.blocked-gap"],
      severity: "blocker",
      summary: "Launch approval has not been recorded.",
      reason: "Launch readiness needs a human release decision.",
      source_refs: [sourceId],
      status: "open",
      authority_state: "execution_evidence",
      approval_state: "pending",
      confidence: 0.8,
      next_step: "Record human approval or keep the launch gate blocked."
    },
    {
      id: "gap.accepted-ops",
      ontology_type: "gap",
      ontology_id: "gap.accepted-ops",
      object_refs: ["claim.assumed"],
      missing: "Operational evidence is not available yet.",
      closure_method: "Accept the operational risk explicitly or attach evidence.",
      blocks: ["claim.assumed"],
      severity: "warning",
      summary: "Operational evidence is accepted as an explicit assumption.",
      reason: "The fixture models early-stage accepted risk.",
      source_refs: [sourceId],
      status: "accepted",
      authority_state: "execution_evidence",
      approval_state: "approved",
      confidence: 0.7
    }
  ]
};

const evidenceIndex = {
  schema_version: CONTRACT_SCHEMA_VERSION,
  evidence: [
    {
      id: "ev.proven",
      ontology_type: "evidence",
      ontology_id: "ev.proven",
      object_refs: ["claim.proven"],
      type: "test_result",
      claim_ids: ["claim.proven"],
      status: "passed",
      captured_at: "2026-01-01T00:00:00.000Z",
      source: { kind: "command", command: "node tests/proof-gap-report.test.mjs", summary: "Fixture test passed." },
      source_refs: [sourceId],
      limitations: "Fixture evidence only.",
      redaction: "summary_only"
    },
    {
      id: "ev.failed",
      ontology_type: "evidence",
      ontology_id: "ev.failed",
      object_refs: ["claim.failed"],
      type: "static_inspection",
      claim_ids: ["claim.failed"],
      status: "failed",
      captured_at: "2026-01-01T00:00:00.000Z",
      source: { kind: "static_inspection", summary: "Fixture inspection failed." },
      source_refs: [sourceId],
      limitations: "Fixture evidence only.",
      redaction: "not_applicable"
    },
    {
      id: "ev.stale",
      ontology_type: "evidence",
      ontology_id: "ev.stale",
      object_refs: ["claim.stale"],
      type: "test_result",
      claim_ids: ["claim.stale"],
      status: "stale",
      captured_at: "2025-01-01T00:00:00.000Z",
      source: { kind: "command", command: "npm run perf", summary: "Old fixture performance result." },
      source_refs: [sourceId],
      limitations: "Fixture evidence only.",
      redaction: "summary_only"
    },
    {
      id: "ev.unsupported",
      ontology_type: "evidence",
      ontology_id: "ev.unsupported",
      object_refs: ["claim.invalid"],
      type: "human_approval",
      claim_ids: ["claim.invalid"],
      status: "passed",
      captured_at: "2026-01-01T00:00:00.000Z",
      source: { kind: "human_review", summary: "Fixture approval does not measure performance." },
      source_refs: [sourceId],
      limitations: "Fixture evidence only.",
      redaction: "not_applicable"
    }
  ]
};

assert.equal((await validateArtifact("proof", proof)).valid, true);
assert.equal((await validateArtifact("evidenceIndex", evidenceIndex)).valid, true);
assert.equal(validateArtifactReferences({ map, proof, evidenceIndex }).valid, true);

const report = createProofGapReport({ proof, evidenceIndex });
assert.equal(report.profile.id, "standard");
assert.equal(report.readiness, "blocked");
assert.equal(report.counts.proven, 1);
assert.equal(report.counts.blocked, 1);
assert.equal(report.counts.assumed, 1);
assert.equal(report.counts.failed, 1);
assert.equal(report.counts.stale, 1);
assert.equal(report.counts.invalid, 1);
assert.match(report.markdown, /Launch proof status: \*\*blocked\*\*/);
assert.match(report.markdown, /Rigor profile: Standard \(standard\)/);
assert.match(report.markdown, /claim\.blocked-gap/);
assert.match(report.markdown, /cmp\.proof-report/);
assert.match(report.markdown, /gap\.launch-approval \(open\)/);
assert.match(report.markdown, /ev\.unsupported \(human_approval, passed\)/);
assert.equal(report.taxonomy.valid, false);

const root = await mkdtemp(path.join(os.tmpdir(), "seal-proof-gap-report-"));
try {
  await mkdir(path.join(root, ".seal", "evidence"), { recursive: true });
  await writeFile(path.join(root, ".seal", "proof.yaml"), YAML.stringify(proof), "utf8");
  await writeFile(path.join(root, ".seal", "evidence", "index.yaml"), YAML.stringify(evidenceIndex), "utf8");

  const { outputPath } = await writeProofGapReport(root, { profile: "launch" });
  const written = await readFile(outputPath, "utf8");
  assert.match(written, /Rigor profile: Launch \(launch\)/);
  assert.match(written, /Top Proof Gaps/);
  assert.match(written, /Record human approval or keep the launch gate blocked\./);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Proof gap report classifies proven, assumed, stale, failed, invalid, and blocked claims.");
