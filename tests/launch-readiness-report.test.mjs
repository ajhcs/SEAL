import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLaunchReadinessReport, writeLaunchReadinessReport } from "../src/launch/readiness-report.mjs";

const source = {
  id: "src.repo",
  kind: "repo",
  path: ".",
  summary: "Repository source.",
  authority_state: "repo_observed",
  approval_state: "not_required",
  confidence: 1,
};

function baseMap(extra = {}) {
  return {
    schema_version: "0.1.0",
    id: "MAP-test",
    sources: [source],
    components: [
      {
        id: "component.core",
        name: "Core",
        summary: "Core component.",
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
        classification: "implementation",
        source_refs: ["src.repo"],
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.9,
      },
    ],
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
    schema_version: "0.1.0",
    id: "PROOF-test",
    claims: [
      {
        id: "claim.core",
        type: "behavior",
        summary: "Core behavior is proven.",
        source_refs: ["src.repo"],
        evidence_refs: ["ev.test"],
        gap_refs: [],
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.9,
      },
    ],
    gaps: [],
    ...extra,
  };
}

function baseEvidence(extra = {}) {
  return {
    schema_version: "0.1.0",
    id: "EVIDENCE-test",
    evidence: [
      {
        id: "ev.test",
        kind: "test_result",
        summary: "Focused test passed.",
        command: "node tests/core.test.mjs",
        status: "passed",
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
assert.equal(passingReport.blockers.length, 0);
assert.match(passingReport.markdown, /Launch decision: \*\*Ready\*\*/);
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
        type: "behavior",
        summary: "Core behavior lacks proof.",
        source_refs: ["src.repo"],
        evidence_refs: ["ev.failed"],
        gap_refs: [],
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.9,
      },
    ],
  }),
  evidenceIndex: baseEvidence({
    evidence: [
      {
        id: "ev.failed",
        kind: "test_result",
        summary: "Focused test failed.",
        command: "node tests/core.test.mjs",
        status: "failed",
        source_refs: ["src.repo"],
        authority_state: "execution_evidence",
        approval_state: "not_required",
        confidence: 0.95,
      },
    ],
  }),
});

assert.equal(failedReport.decision.label, "Do not launch");
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
assert.ok(incompleteReport.known_unknowns.some((unknown) => unknown.id === "gap.interface"));
assert.match(incompleteReport.markdown, /Interface owner is unknown/);
assert.match(incompleteReport.markdown, /impact.proof_required:proof.interface/);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "seal-launch-"));
try {
  await mkdir(path.join(tempRoot, ".seal", "evidence"), { recursive: true });
  await writeFile(path.join(tempRoot, "core.mjs"), "export const ok = true;\n", "utf8");
  await writeFile(path.join(tempRoot, ".seal", "map.yaml"), [
    'schema_version: "0.1.0"',
    "sources:",
    "  - id: src.repo",
    "    kind: repo_observation",
    "    path: .",
    "    summary: Temp repo.",
    "    authority_state: repo_observed",
    "    approval_state: not_required",
    "    confidence: 1",
    "components:",
    "  - id: component.core",
    "    name: Core",
    "    summary: Core component.",
    "    source_refs: [src.repo]",
    "    authority_state: repo_observed",
    "    approval_state: not_required",
    "    confidence: 0.9",
    "files:",
    "  - path: core.mjs",
    "    component_id: component.core",
    "    classification: product_code",
    "    source_refs: [src.repo]",
    "    authority_state: repo_observed",
    "    approval_state: not_required",
    "    confidence: 0.9",
    "requirements: []",
    "risks: []",
    "assumptions: []",
    "launch_gates: []",
    "trace_links: []",
    "gaps: []",
    "",
  ].join("\n"), "utf8");
  await writeFile(path.join(tempRoot, ".seal", "proof.yaml"), [
    'schema_version: "0.1.0"',
    "claims:",
    "  - id: claim.core",
    "    type: functional",
    "    statement: Core behavior is proven.",
    "    summary: Core behavior is proven.",
    "    source_refs: [src.repo]",
    "    evidence_refs: [ev.test]",
    "    gap_refs: []",
    "    authority_state: repo_observed",
    "    approval_state: not_required",
    "    confidence: 0.9",
    "gaps: []",
    "",
  ].join("\n"), "utf8");
  await writeFile(path.join(tempRoot, ".seal", "evidence", "index.yaml"), [
    'schema_version: "0.1.0"',
    "evidence:",
    "  - id: ev.test",
    "    type: test_result",
    "    claim_ids: [claim.core]",
    "    summary: Focused test passed.",
    "    command: node tests/core.test.mjs",
    "    status: passed",
    "    captured_at: 2026-06-28T00:00:00Z",
    "    source:",
    "      kind: command",
    "      command: node tests/core.test.mjs",
    "      summary: Focused test passed.",
    "    source_refs: [src.repo]",
    "    authority_state: execution_evidence",
    "    approval_state: not_required",
    "    confidence: 0.95",
    "    limitations: Fixture evidence only proves the launch report writer path.",
    "",
  ].join("\n"), "utf8");

  const { outputPath, report } = await writeLaunchReadinessReport(tempRoot);
  const markdown = await readFile(outputPath, "utf8");
  assert.match(markdown, /# SEAL Launch Readiness/);
  assert.equal(report.decision.label, "Ready");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Launch readiness report tests passed.");
