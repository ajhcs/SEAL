import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACT_SCHEMA_VERSION, GENERATED_VIEW_NOTICE } from "../src/contracts/constants.mjs";
import { createDashboard, writeDashboard } from "../src/views/dashboard.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const source = {
  id: "src.dashboard",
  kind: "repo_observation",
  path: ".",
  summary: "Dashboard fixture source.",
  description: "Dashboard fixture source.",
  authority_state: "repo_observed",
  approval_state: "not_required",
  confidence: 1
};

function baseMap(extra = {}) {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    id: "MAP-dashboard",
    sources: [source],
    purpose: {
      summary: "Make launch state visible without changing canonical artifacts.",
      source_refs: ["src.dashboard"],
      authority_state: "repo_observed",
      approval_state: "not_required",
      confidence: 0.9
    },
    boundary: {
      root: ".",
      included: ["src/dashboard.mjs"],
      excluded: [".seal/views"],
      source_refs: ["src.dashboard"],
      authority_state: "repo_observed",
      approval_state: "not_required",
      confidence: 0.9
    },
    observed: {
      components: ["component.dashboard"],
      files: ["src/dashboard.mjs"],
      dependencies: [],
      services: [],
      interfaces: [],
      data_stores: [],
      tests: [],
      source_refs: ["src.dashboard"]
    },
    approved: {
      components: [],
      boundaries: [],
      interfaces: [],
      source_refs: ["src.dashboard"],
      status: "none",
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.5
    },
    drift: [],
    components: [
      {
        id: "component.dashboard",
        name: "Dashboard",
        purpose: "Render the human dashboard.",
        summary: "Dashboard component.",
        files: ["src/dashboard.mjs"],
        dependencies: [],
        interfaces: [],
        tests: [],
        proof_gaps: [],
        unknowns: [],
        source_refs: ["src.dashboard"],
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.9
      }
    ],
    files: [],
    dependencies: [],
    services: {
      discovered: [],
      negative_evidence: ["No services are recorded by this sparse fixture."],
      gaps: []
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
    ...extra
  };
}

function baseProof(extra = {}) {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    id: "PROOF-dashboard",
    claims: [
      {
        id: "claim.dashboard",
        subject: "component.dashboard",
        type: "functional",
        status: "proven",
        statement: "The dashboard renderer is covered.",
        summary: "Dashboard renderer is covered.",
        source_refs: ["src.dashboard"],
        evidence_refs: ["ev.dashboard"],
        gap_refs: [],
        counterevidence_refs: [],
        limitations: [],
        freshness: {
          status: "current",
          checked_at: "2026-01-01T00:00:00.000Z",
          basis: "Fixture evidence was captured for dashboard coverage."
        },
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.9
      }
    ],
    evidence: [],
    gaps: [],
    ...extra
  };
}

function baseEvidence(extra = {}) {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    id: "EVIDENCE-dashboard",
    evidence: [
      {
        id: "ev.dashboard",
        type: "test_result",
        summary: "Dashboard test passed.",
        claim_ids: ["claim.dashboard"],
        status: "passed",
        captured_at: "2026-01-01T00:00:00.000Z",
        source: {
          kind: "command",
          command: "node tests/dashboard-view.test.mjs"
        },
        artifact_path: ".seal/evidence/dashboard-test.txt",
        artifact_hash: "0000000000000000000000000000000000000000000000000000000000000000",
        hash_algorithm: "sha256",
        limitations: "Fixture evidence only proves dashboard output shape.",
        redaction: "summary_only",
        source_refs: ["src.dashboard"],
        authority_state: "execution_evidence",
        approval_state: "not_required",
        confidence: 0.95
      }
    ],
    ...extra
  };
}

const validValidation = {
  root: "/repo",
  valid: true,
  validated: [],
  diagnostics: []
};

const richDashboard = createDashboard({
  validation: validValidation,
  map: baseMap({
    services: {
      discovered: [
        {
          id: "service.dashboard-api",
          summary: "Dashboard API service risk is tracked.",
          cost_model: "metered",
          data_risk: "medium",
          source_refs: ["src.dashboard"]
        }
      ],
      gaps: []
    },
    dependencies: [
      {
        id: "dep.yaml",
        summary: "YAML dependency parses canonical artifacts.",
        source_refs: ["src.dashboard"]
      }
    ],
    data_stores: [
      {
        id: "data.audit-log",
        summary: "Audit log entries are summarized.",
        source_refs: ["src.dashboard"]
      }
    ],
    risks: [
      {
        id: "risk.security-review",
        summary: "Security review remains visible.",
        source_refs: ["src.dashboard"]
      }
    ],
    gaps: [
      {
        id: "gap.map",
        summary: "Map has a known fixture gap.",
        source_refs: ["src.dashboard"],
        authority_state: "repo_observed",
        approval_state: "pending",
        confidence: 0.7,
        status: "open"
      }
    ]
  }),
  proof: baseProof({
    claims: [
      ...baseProof().claims,
      {
        id: "claim.gapped",
        subject: "component.dashboard",
        type: "launch",
        status: "gapped",
        statement: "Human dashboard launch approval is missing.",
        summary: "Human dashboard launch approval is missing.",
        source_refs: ["src.dashboard"],
        evidence_refs: [],
        gap_refs: ["gap.launch"],
        counterevidence_refs: [],
        limitations: [],
        freshness: {
          status: "unknown",
          checked_at: "2026-01-01T00:00:00.000Z",
          basis: "Approval evidence is intentionally absent."
        },
        authority_state: "repo_observed",
        approval_state: "pending",
        confidence: 0.6
      }
    ],
    gaps: [
      {
        id: "gap.launch",
        missing: "Launch approval evidence.",
        closure_method: "Record approval or keep launch blocked.",
        blocks: ["claim.gapped"],
        severity: "blocker",
        summary: "Launch approval is not recorded.",
        reason: "Fixture needs a blocker for dashboard display.",
        source_refs: ["src.dashboard"],
        status: "open",
        authority_state: "repo_observed",
        approval_state: "pending",
        confidence: 0.7
      }
    ]
  }),
  evidenceIndex: baseEvidence(),
  impacts: [
    {
      id: "IMPACT-dashboard",
      change: {
        target: "src/views/dashboard.mjs",
        summary: "Dashboard view was generated from canonical artifacts.",
        source_refs: ["src.dashboard"]
      },
      affected: {
        requirements: [],
        components: [],
        files: [],
        interfaces: [],
        invariants: [],
        schemas: [],
        tests: []
      },
      dependency_service_cost_impact: {
        dependencies_changed: true,
        services_changed: false,
        cost_changed: false,
        new_runtime_costs: [],
        removed_runtime_costs: [],
        unknown_costs: [],
        source_refs: ["src.dashboard"]
      },
      proof_required: [],
      approval_needed: [
        {
          id: "approval.dashboard",
          summary: "Dashboard launch approval is pending.",
          source_refs: ["src.dashboard"],
          approval_state: "pending"
        }
      ],
      blocking_unknowns: [],
      gaps: []
    }
  ],
  debt: {
    schema_version: CONTRACT_SCHEMA_VERSION,
    source_refs: ["src.dashboard"],
    records: [
      {
        id: "debt.cost",
        type: "cost_unknown",
        subject: "Dashboard cost",
        summary: "Dashboard cost needs review.",
        severity: "warning",
        source_refs: ["src.dashboard"],
        blocks: [],
        closure_method: "Record cost model.",
        status: "open",
        created_by: "dashboard-test"
      }
    ]
  },
  auditWrites: [
    {
      line: 1,
      artifact: ".seal/views/dashboard.md",
      summary: "dashboard view written"
    }
  ]
});

assert.match(richDashboard.markdown, /# SEAL Dashboard/);
assert.match(richDashboard.markdown, new RegExp(GENERATED_VIEW_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(richDashboard.markdown, /non-authoritative generated view/);
assert.match(richDashboard.markdown, /source:src\.dashboard/);
assert.match(richDashboard.markdown, /evidence:ev\.dashboard/);
assert.match(richDashboard.markdown, /gap:gap\.map/);
assert.match(richDashboard.markdown, /audit:artifact-writes line:1/);
assert.match(richDashboard.markdown, /\.seal\/views\/repo-map\.md/);
assert.match(richDashboard.markdown, /\.seal\/index\.yaml/);
assert.match(richDashboard.markdown, /\.seal\/reports\/proof-gaps\.md/);
assert.match(richDashboard.markdown, /\.seal\/reports\/launch-readiness\.md/);

for (const line of richDashboard.markdown.split(/\r?\n/).filter((entry) => entry.startsWith("- "))) {
  assert.match(line, /\[[^\]]+\]/, `dashboard bullet should carry trace marker: ${line}`);
}

const sparseDashboard = createDashboard({
  validation: validValidation,
  map: baseMap(),
  proof: { schema_version: CONTRACT_SCHEMA_VERSION, id: "PROOF-empty", claims: [], evidence: [], gaps: [] },
  evidenceIndex: { schema_version: CONTRACT_SCHEMA_VERSION, id: "EVIDENCE-empty", evidence: [] },
  impacts: []
});

assert.match(sparseDashboard.markdown, /Services: not recorded \[gap:not-recorded\.risks\.services\]/);
assert.match(sparseDashboard.markdown, /Security: not recorded \[gap:not-recorded\.risks\.security\]/);
assert.match(sparseDashboard.markdown, /Recent changes: not recorded \[gap:not-recorded\.recent-changes\]/);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "seal-dashboard-view-"));
try {
  const fixtureRoot = path.join(tempRoot, "pass");
  await cp(path.join(repoRoot, "tests", "fixtures", "full-workflow", "pass"), fixtureRoot, { recursive: true });
  await mkdir(path.join(fixtureRoot, ".seal", "audit"), { recursive: true });
  await writeFile(
    path.join(fixtureRoot, ".seal", "audit", "artifact-writes.jsonl"),
    `${JSON.stringify({ artifact: ".seal/map.yaml", summary: "map refreshed" })}\n`,
    "utf8"
  );

  const { outputPath, dashboard } = await writeDashboard(fixtureRoot);
  const markdown = await readFile(outputPath, "utf8");
  assert.equal(outputPath, path.join(fixtureRoot, ".seal", "views", "dashboard.md"));
  assert.equal(dashboard.launch.decision.label, "Ready");
  assert.match(markdown, /Generated from \.seal\/\*\.yaml/);
  assert.match(markdown, /Audit \.seal\/map\.yaml: map refreshed/);

  await assert.rejects(
    () => stat(path.join(fixtureRoot, "SEAL.md")),
    (error) => error.code === "ENOENT"
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Dashboard view tests passed.");
