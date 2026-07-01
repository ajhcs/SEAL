import assert from "node:assert/strict";

import { evaluateGatePolicy, formatGatePolicyReport } from "../src/gates/policy.mjs";

const passingContext = {
  validation: {
    valid: true,
    diagnostics: [],
  },
  map: {
    sources: [{ id: "SRC-1", confidence: 0.9, authority_state: "approved" }],
    requirements: [],
    risks: [],
    assumptions: [],
    gaps: [],
    launch_gates: [],
  },
  proof: {
    claims: [{ id: "CLAIM-1", evidence_refs: ["EVID-1"], gap_refs: [], status: "proven" }],
    gaps: [],
  },
  evidenceIndex: {
    evidence: [{ id: "EVID-1", status: "passed" }],
  },
  launchReport: {
    blockers: [],
    known_unknowns: [],
  },
  impacts: [],
};

function nonPass(report) {
  return report.decisions.filter((decision) => decision.status !== "pass");
}

function assertLinked(decisions) {
  for (const decision of decisions) {
    assert.ok(decision.artifact_refs.length > 0, `${decision.id} should link to evidence`);
    assert.ok(decision.artifact_refs.every((ref) => ref.artifact && ref.ref), `${decision.id} should have usable refs`);
  }
}

{
  const report = evaluateGatePolicy(passingContext);

  assert.equal(report.profile.id, "standard");
  assert.equal(report.overall, "pass");
  assert.equal(nonPass(report).length, 0);
  assert.match(formatGatePolicyReport(report), /Rigor profile: Standard \(standard\)/);
}

{
  const report = evaluateGatePolicy(passingContext, { profile: "launch" });
  const decision = report.decisions.find((item) => item.id === "rigor.profile.impact-required");

  assert.equal(report.profile.id, "launch");
  assert.equal(report.overall, "blocked");
  assert.equal(decision.status, "blocked");
  assertLinked(nonPass(report));
}

{
  const report = evaluateGatePolicy(
    {
      ...passingContext,
      proof: {
        claims: [{ id: "CLAIM-1", evidence_refs: ["EVID-1"], gap_refs: ["GAP-accepted"], status: "gapped" }],
        gaps: [{ id: "GAP-accepted", status: "accepted" }],
      },
      evidenceIndex: {
        evidence: [
          { id: "EVID-1", status: "stale" },
          { id: "EVID-approval", type: "human_approval", status: "passed", approval_state: "approved" },
        ],
      },
      impacts: [
        {
          id: "IMPACT-core",
          affected: [],
          proof_required: [],
          approval_needed: [],
          gaps: [],
        },
      ],
    },
    { profile: "mission-critical" },
  );

  assert.equal(report.profile.id, "mission-critical");
  assert.equal(report.overall, "blocked");
  assert.equal(report.decisions.find((item) => item.id === "rigor.profile.current-evidence-required").status, "blocked");
  assert.equal(report.decisions.find((item) => item.id === "rigor.profile.no-accepted-gaps").status, "blocked");
  assertLinked(nonPass(report));
}

{
  const report = evaluateGatePolicy({
    ...passingContext,
    validation: {
      valid: false,
      diagnostics: [
        {
          artifactType: "map",
          file: ".seal/map.yaml",
          path: "$.components[0]",
          actual: "missing_required_property",
        },
      ],
    },
  });
  const decision = report.decisions.find((item) => item.id === "gate.plan.schema-valid");

  assert.equal(report.overall, "fail");
  assert.equal(decision.status, "fail");
  assert.equal(decision.artifact_refs[0].file, ".seal/map.yaml");
  assertLinked(nonPass(report));
  assert.match(formatGatePolicyReport(report), /Overall status: fail/);
}

{
  const report = evaluateGatePolicy({
    ...passingContext,
    evidenceIndex: {
      evidence: [{ id: "EVID-stale", status: "stale", authority_state: "approved" }],
    },
  });
  const decision = report.decisions.find((item) => item.id === "gate.prove.stale-evidence-warning");

  assert.equal(report.overall, "warn");
  assert.equal(decision.status, "warn");
  assert.equal(decision.artifact_refs[0].ref, "EVID-stale");
  assertLinked(nonPass(report));
}

{
  const report = evaluateGatePolicy({
    ...passingContext,
    impacts: [
      {
        id: "IMPACT-checkout",
        affected: [],
        proof_required: [{ id: "PROOF-checkout", status: "open", action: "Run checkout proof." }],
        approval_needed: [],
        gaps: [],
      },
    ],
  });
  const decision = report.decisions.find((item) => item.id === "gate.impact.proof-required.IMPACT-checkout.PROOF-checkout");

  assert.equal(report.overall, "blocked");
  assert.equal(decision.status, "blocked");
  assert.equal(decision.artifact_refs[0].artifact, "impact.proof_required");
  assertLinked(nonPass(report));
}

{
  const report = evaluateGatePolicy({
    ...passingContext,
    impacts: [
      {
        id: "IMPACT-unknown",
        affected: [{ id: "AFFECTED-runtime", kind: "unknown", authority_state: "inferred" }],
        proof_required: [],
        approval_needed: [],
        gaps: [],
      },
    ],
  });
  const decision = report.decisions.find((item) => item.id === "gate.impact.unknown.IMPACT-unknown.AFFECTED-runtime");

  assert.equal(report.overall, "unknown");
  assert.equal(decision.status, "unknown");
  assert.equal(decision.artifact_refs[0].ref, "AFFECTED-runtime");
  assertLinked(nonPass(report));
}

console.log("gate policy tests passed");
