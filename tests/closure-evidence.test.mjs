import assert from "node:assert/strict";

import { evaluateGatePolicy } from "../src/gates/policy.mjs";
import { createLaunchReadinessReport } from "../src/launch/readiness-report.mjs";
import { createProofGapReport } from "../src/proof/gap-report.mjs";
import { routeSealRequest } from "../src/skill-routing/route.mjs";

const context = {
  validation: { valid: true, diagnostics: [] },
  map: {
    sources: [{ id: "src.repo", confidence: 1, authority_state: "repo_observed" }],
    requirements: [],
    risks: [],
    assumptions: [],
    gaps: [],
    launch_gates: [],
  },
  proof: {
    claims: [{ id: "claim.core", status: "proven", evidence_refs: ["ev.core"], gap_refs: [] }],
    gaps: [],
  },
  evidenceIndex: {
    evidence: [{ id: "ev.core", type: "test_result", status: "passed", claim_ids: ["claim.core"] }],
  },
  launchReport: { blockers: [], known_unknowns: [] },
  impacts: [],
};

const route = routeSealRequest("Build proof for the launch report", { profile: "launch" });
assert.equal(route.profile.id, "launch");
assert.ok(route.profile.required_artifacts.includes("impact"));
assert.ok(route.starterQuestions.includes("Who owns the launch approval?"));

const policy = evaluateGatePolicy(context, { profile: "launch" });
assert.equal(policy.profile.id, "launch");
assert.equal(policy.overall, "blocked");
assert.ok(policy.decisions.some((decision) => decision.id === "rigor.profile.impact-required"));

const proofReport = createProofGapReport({ proof: context.proof, evidenceIndex: context.evidenceIndex, profile: "mission-critical" });
assert.equal(proofReport.profile.id, "mission-critical");
assert.match(proofReport.markdown, /Rigor profile: Mission-critical \(mission-critical\)/);

const readiness = createLaunchReadinessReport({
  validation: context.validation,
  map: context.map,
  proof: context.proof,
  evidenceIndex: context.evidenceIndex,
  impacts: context.impacts,
  profile: "launch",
});
assert.equal(readiness.profile.id, "launch");
assert.match(readiness.markdown, /## Rigor Profile/);
assert.ok(readiness.blockers.some((blocker) => blocker.id === "rigor.profile.impact-required"));

console.log("Closure evidence covers profile routing, gates, proof, and readiness reports.");
