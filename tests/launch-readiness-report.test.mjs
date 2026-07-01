import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createOntologyArtifact, stringifyArtifact } from "../src/artifacts/generate.mjs";
import { CONTRACT_SCHEMA_VERSION } from "../src/contracts/constants.mjs";
import { createLaunchReadinessReport, writeLaunchReadinessReport } from "../src/launch/readiness-report.mjs";

const source = {
  id: "src.repo",
  kind: "repo_observation",
  path: ".",
  summary: "Repository source.",
  description: "Repository source.",
  authority_state: "repo_observed",
  approval_state: "not_required",
  confidence: 1,
};

function baseMap(extra = {}) {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    id: "MAP-test",
    sources: [source],
    purpose: {
      summary: "Core component launch readiness fixture.",
      source_refs: ["src.repo"],
      authority_state: "repo_observed",
      approval_state: "not_required",
      confidence: 0.9,
    },
    boundary: {
      root: ".",
      included: ["src/core.mjs"],
      excluded: [".seal/views"],
      source_refs: ["src.repo"],
      authority_state: "repo_observed",
      approval_state: "not_required",
      confidence: 0.9,
    },
    observed: {
      components: ["component.core"],
      files: ["src/core.mjs"],
      dependencies: [],
      services: [],
      interfaces: [],
      data_stores: [],
      tests: [],
      source_refs: ["src.repo"],
    },
    approved: {
      components: [],
      boundaries: [],
      interfaces: [],
      source_refs: ["src.repo"],
      status: "none",
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.5,
    },
    drift: [],
    components: [
      {
        id: "component.core",
        name: "Core",
        purpose: "Core component.",
        summary: "Core component.",
        files: ["src/core.mjs"],
        dependencies: [],
        interfaces: [],
        tests: [],
        proof_gaps: [],
        unknowns: [],
        source_refs: ["src.repo"],
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.9,
      },
    ],
    files: [
      {
        path: "src/core.mjs",
        component_id: "component.core",
        owner_component_id: "component.core",
        ownership_status: "owned",
        classification: "product_code",
        source_refs: ["src.repo"],
        content_hash: "0000000000000000000000000000000000000000000000000000000000000000",
        mapped_at: "2026-01-01T00:00:00.000Z",
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.9,
      },
    ],
    dependencies: [],
    services: {
      discovered: [],
      negative_evidence: ["No runtime services are used by the launch readiness fixture."],
      gaps: [],
    },
    interfaces: [],
    data_stores: [],
    tests: [],
    unknowns: [],
    requirements: [],
    risks: [],
    assumptions: [],
    launch_gates: [],
    trace_links: [],
    gaps: [],
    ...extra,
  };
}

function baseProof(extra = {}) {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    id: "PROOF-test",
    claims: [
      {
        id: "claim.core",
        ontology_type: "claim",
        ontology_id: "claim.core",
        object_refs: ["component.core", "src/core.mjs"],
        subject: "component.core",
        type: "functional",
        status: "proven",
        statement: "Core behavior is proven.",
        summary: "Core behavior is proven.",
        source_refs: ["src.repo"],
        evidence_refs: ["ev.test"],
        gap_refs: [],
        counterevidence_refs: [],
        limitations: [],
        freshness: {
          status: "current",
          checked_at: "2026-01-01T00:00:00.000Z",
          basis: "Fixture evidence was captured for this contract version.",
        },
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.9,
      },
    ],
    evidence: [],
    gaps: [],
    ...extra,
  };
}

function baseEvidence(extra = {}) {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    id: "EVIDENCE-test",
    evidence: [
      {
        id: "ev.test",
        ontology_type: "evidence",
        ontology_id: "ev.test",
        object_refs: ["claim.core", "component.core"],
        type: "test_result",
        summary: "Focused test passed.",
        claim_ids: ["claim.core"],
        status: "passed",
        captured_at: "2026-01-01T00:00:00.000Z",
        source: {
          kind: "command",
          command: "node tests/core.test.mjs",
        },
        artifact_path: ".seal/evidence/core-test.txt",
        artifact_hash: "0000000000000000000000000000000000000000000000000000000000000000",
        hash_algorithm: "sha256",
        limitations: "Fixture evidence only proves the launch report path.",
        redaction: "summary_only",
        source_refs: ["src.repo"],
        authority_state: "execution_evidence",
        approval_state: "not_required",
        confidence: 0.95,
      },
    ],
    ...extra,
  };
}

const validValidation = {
  root: "/repo",
  valid: true,
  validated: [],
  diagnostics: [],
};

const passingReport = createLaunchReadinessReport({
  validation: validValidation,
  map: baseMap(),
  impacts: [],
  proof: baseProof(),
  evidenceIndex: baseEvidence(),
});

assert.equal(passingReport.decision.label, "Ready");
assert.equal(passingReport.profile.id, "standard");
assert.equal(passingReport.readiness_level.id, "SRL-5");
assert.equal(passingReport.blockers.length, 0);
assert.match(passingReport.markdown, /Launch decision: \*\*Ready\*\*/);
assert.match(passingReport.markdown, /## Readiness Level/);
assert.match(passingReport.markdown, /## Rigor Profile/);
assert.match(passingReport.markdown, /Rigor profile: Standard \(standard\)/);
assert.match(passingReport.markdown, /SRL-5 - Launch ready/);
assert.match(passingReport.markdown, /map:summary/);

const failedReport = createLaunchReadinessReport({
  validation: {
    root: "/repo",
    valid: false,
    validated: [],
    diagnostics: [
      {
        file: "/repo/.seal/map.yaml",
        artifactType: "map",
        path: "/components/0/id",
        expected: "valid id",
        actual: "missing",
        fix: "Add an id.",
        message: "MAP schema validation failed.",
      },
    ],
  },
  map: baseMap(),
  impacts: [],
  proof: baseProof({
    claims: [
      {
        id: "claim.core",
        subject: "component.core",
        type: "functional",
        status: "rejected",
        statement: "Core behavior lacks proof.",
        summary: "Core behavior lacks proof.",
        source_refs: ["src.repo"],
        evidence_refs: ["ev.failed"],
        gap_refs: [],
        counterevidence_refs: ["ev.failed"],
        limitations: [],
        freshness: {
          status: "current",
          checked_at: "2026-01-01T00:00:00.000Z",
          basis: "Fixture evidence was captured for this contract version.",
        },
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.9,
      },
    ],
    evidence: [],
  }),
  evidenceIndex: baseEvidence({
    evidence: [
      {
        id: "ev.failed",
        type: "test_result",
        summary: "Focused test failed.",
        claim_ids: ["claim.core"],
        status: "failed",
        captured_at: "2026-01-01T00:00:00.000Z",
        source: {
          kind: "command",
          command: "node tests/core.test.mjs",
        },
        artifact_path: ".seal/evidence/core-test.txt",
        artifact_hash: "0000000000000000000000000000000000000000000000000000000000000000",
        hash_algorithm: "sha256",
        limitations: "Fixture evidence records the failed test result.",
        redaction: "summary_only",
        source_refs: ["src.repo"],
        authority_state: "execution_evidence",
        approval_state: "not_required",
        confidence: 0.95,
      },
    ],
  }),
});

assert.equal(failedReport.decision.label, "Do not launch");
assert.equal(failedReport.readiness_level.id, "SRL-0");
assert.ok(failedReport.blockers.some((blocker) => blocker.artifact_refs.length > 0));
assert.match(failedReport.markdown, /MAP schema validation failed/);
assert.match(failedReport.markdown, /validation:\/components\/0\/id/);

const incompleteReport = createLaunchReadinessReport({
  validation: validValidation,
  map: baseMap({
    gaps: [
      {
        id: "gap.interface",
        summary: "Interface owner is unknown.",
        source_refs: ["src.repo"],
        authority_state: "repo_observed",
        approval_state: "pending",
        confidence: 0.7,
        status: "open",
      },
    ],
  }),
  impacts: [
    {
      id: "IMPACT-core",
      affected: [
        {
          kind: "unknown",
          id: "unknown.interface",
          reason: "No interface mapping exists.",
          source_refs: ["src.repo"],
          authority_state: "repo_observed",
          approval_state: "pending",
          confidence: 0.7,
        },
      ],
      proof_required: [
        {
          id: "proof.interface",
          status: "open",
          reason: "Interface behavior must be proven.",
          source_refs: ["src.repo"],
          authority_state: "repo_observed",
          approval_state: "pending",
          confidence: 0.7,
        },
      ],
      approval_needed: [],
      gaps: [],
    },
  ],
  proof: baseProof(),
  evidenceIndex: baseEvidence(),
});

assert.equal(incompleteReport.decision.label, "Blocked");
assert.equal(incompleteReport.readiness_level.id, "SRL-3");
assert.ok(incompleteReport.known_unknowns.some((unknown) => unknown.id === "gap.interface"));
assert.match(incompleteReport.markdown, /Interface owner is unknown/);
assert.match(incompleteReport.markdown, /impact.proof_required:proof.interface/);

const cautionReport = createLaunchReadinessReport({
  validation: validValidation,
  map: baseMap(),
  impacts: [],
  proof: baseProof(),
  evidenceIndex: baseEvidence({
    evidence: [
      {
        id: "ev.stale",
        type: "test_result",
        summary: "Focused test is stale.",
        claim_ids: ["claim.core"],
        status: "stale",
        captured_at: "2026-01-01T00:00:00.000Z",
        source: {
          kind: "command",
          command: "node tests/core.test.mjs",
        },
        artifact_path: ".seal/evidence/core-test.txt",
        artifact_hash: "0000000000000000000000000000000000000000000000000000000000000000",
        hash_algorithm: "sha256",
        limitations: "Fixture evidence is intentionally stale.",
        redaction: "summary_only",
        source_refs: ["src.repo"],
        authority_state: "execution_evidence",
        approval_state: "not_required",
        confidence: 0.95,
      },
    ],
  }),
});

assert.equal(cautionReport.decision.label, "Ready with cautions");
assert.equal(cautionReport.readiness_level.id, "SRL-4");
assert.match(cautionReport.markdown, /SRL-4 - Ready with cautions/);

const launchProfileReport = createLaunchReadinessReport({
  validation: validValidation,
  map: baseMap(),
  impacts: [],
  proof: baseProof(),
  evidenceIndex: baseEvidence(),
  profile: "launch",
});

assert.equal(launchProfileReport.profile.id, "launch");
assert.equal(launchProfileReport.decision.label, "Blocked");
assert.ok(launchProfileReport.blockers.some((blocker) => blocker.id === "rigor.profile.impact-required"));

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "seal-launch-"));
try {
  await mkdir(path.join(tempRoot, ".seal", "evidence"), { recursive: true });
  await writeFile(path.join(tempRoot, "core.mjs"), "export const ok = true;\n", "utf8");
  await writeFile(
    path.join(tempRoot, ".seal", "ontology.yaml"),
    stringifyArtifact(createOntologyArtifact({ sourceId: "src.repo" })),
    "utf8"
  );
  await writeFile(path.join(tempRoot, ".seal", "map.yaml"), [
    `schema_version: "${CONTRACT_SCHEMA_VERSION}"`,
    "sources:",
    "  - id: src.repo",
    "    kind: repo_observation",
    "    path: .",
    "    summary: Temp repo.",
    "    description: Temp repo.",
    "    authority_state: repo_observed",
    "    approval_state: not_required",
    "    confidence: 1",
    "purpose:",
    "  summary: Temp launch readiness fixture.",
    "  source_refs: [src.repo]",
    "  authority_state: repo_observed",
    "  approval_state: not_required",
    "  confidence: 0.9",
    "boundary:",
    "  root: .",
    "  included: [core.mjs]",
    "  excluded: [.seal/views]",
    "  source_refs: [src.repo]",
    "  authority_state: repo_observed",
    "  approval_state: not_required",
    "  confidence: 0.9",
    "observed:",
    "  components: [component.core]",
    "  files: [core.mjs]",
    "  dependencies: []",
    "  services: []",
    "  interfaces: []",
    "  data_stores: []",
    "  tests: []",
    "  source_refs: [src.repo]",
    "approved:",
    "  components: []",
    "  boundaries: []",
    "  interfaces: []",
    "  source_refs: [src.repo]",
    "  status: none",
    "  authority_state: repo_observed",
    "  approval_state: pending",
    "  confidence: 0.5",
    "drift: []",
    "components:",
    "  - id: component.core",
    "    name: Core",
    "    purpose: Core component.",
    "    summary: Core component.",
    "    files: [core.mjs]",
    "    dependencies: []",
    "    interfaces: []",
    "    tests: []",
    "    proof_gaps: []",
    "    unknowns: []",
    "    source_refs: [src.repo]",
    "    authority_state: repo_observed",
    "    approval_state: not_required",
    "    confidence: 0.9",
    "files:",
    "  - path: core.mjs",
    "    component_id: component.core",
    "    owner_component_id: component.core",
    "    ownership_status: owned",
    "    classification: product_code",
    "    source_refs: [src.repo]",
    "    content_hash: '0000000000000000000000000000000000000000000000000000000000000000'",
    "    mapped_at: '2026-01-01T00:00:00.000Z'",
    "    authority_state: repo_observed",
    "    approval_state: not_required",
    "    confidence: 0.9",
    "dependencies: []",
    "services:",
    "  discovered: []",
    "  negative_evidence: [No runtime services are used by the temp fixture.]",
    "  gaps: []",
    "interfaces: []",
    "data_stores: []",
    "tests: []",
    "unknowns: []",
    "requirements: []",
    "risks: []",
    "assumptions: []",
    "launch_gates: []",
    "trace_links: []",
    "gaps: []",
    "",
  ].join("\n"), "utf8");
  await writeFile(path.join(tempRoot, ".seal", "proof.yaml"), [
    `schema_version: "${CONTRACT_SCHEMA_VERSION}"`,
    "claims:",
    "  - id: claim.core",
    "    ontology_type: claim",
    "    ontology_id: claim.core",
    "    object_refs: [component.core, core.mjs]",
    "    subject: component.core",
    "    type: functional",
    "    status: proven",
    "    statement: Core behavior is proven.",
    "    summary: Core behavior is proven.",
    "    source_refs: [src.repo]",
    "    evidence_refs: [ev.test]",
    "    gap_refs: []",
    "    counterevidence_refs: []",
    "    limitations: []",
    "    freshness:",
    "      status: current",
    "      checked_at: '2026-01-01T00:00:00.000Z'",
    "      basis: Fixture evidence was captured for this contract version.",
    "    authority_state: repo_observed",
    "    approval_state: not_required",
    "    confidence: 0.9",
    "evidence: []",
    "gaps: []",
    "",
  ].join("\n"), "utf8");
  await writeFile(path.join(tempRoot, ".seal", "evidence", "index.yaml"), [
    `schema_version: "${CONTRACT_SCHEMA_VERSION}"`,
    "evidence:",
    "  - id: ev.test",
    "    ontology_type: evidence",
    "    ontology_id: ev.test",
    "    object_refs: [claim.core, component.core]",
    "    type: test_result",
    "    claim_ids: [claim.core]",
    "    summary: Focused test passed.",
    "    command: node tests/core.test.mjs",
    "    status: passed",
    "    captured_at: '2026-06-28T00:00:00Z'",
    "    source:",
    "      kind: command",
    "      command: node tests/core.test.mjs",
      "      summary: Focused test passed.",
    "    artifact_path: .seal/evidence/core-test.txt",
    "    artifact_hash: '0000000000000000000000000000000000000000000000000000000000000000'",
    "    hash_algorithm: sha256",
    "    source_refs: [src.repo]",
    "    authority_state: execution_evidence",
    "    approval_state: not_required",
    "    confidence: 0.95",
    "    limitations: Fixture evidence only proves the launch report writer path.",
    "    redaction: summary_only",
    "",
  ].join("\n"), "utf8");

  const { outputPath, report } = await writeLaunchReadinessReport(tempRoot);
  const markdown = await readFile(outputPath, "utf8");
  assert.match(markdown, /# SEAL Launch Readiness/);
  assert.match(markdown, /Readiness level: SRL-5 - Launch ready/);
  assert.equal(report.decision.label, "Ready");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Launch readiness report tests passed.");
