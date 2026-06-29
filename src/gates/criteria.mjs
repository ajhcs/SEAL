const phases = Object.freeze(["plan", "build", "prove", "launch"]);
const levels = Object.freeze(["hard_fail", "warn"]);

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function hasDiagnostic(context, predicate) {
  return asList(context.validation?.diagnostics).some(predicate);
}

function hasMapGap(context, predicate) {
  return asList(context.map?.gaps).some(predicate);
}

function hasProofGap(context, predicate) {
  return asList(context.proof?.gaps).some(predicate);
}

function hasProofClaim(context, predicate) {
  return asList(context.proof?.claims).some(predicate);
}

function hasEvidence(context, predicate) {
  return asList(context.evidenceIndex?.evidence).some(predicate);
}

function hasLaunchReportBlocker(context, predicate) {
  return asList(context.launchReport?.blockers).some(predicate);
}

function hasLaunchReportUnknown(context, predicate) {
  return asList(context.launchReport?.known_unknowns).some(predicate);
}

function isSchemaDiagnostic(diagnostic) {
  return ["map", "impact", "proof", "evidenceIndex"].includes(diagnostic.artifactType);
}

function isReferenceDiagnostic(diagnostic) {
  return diagnostic.artifactType === "reference";
}

function isCoverageDiagnostic(diagnostic) {
  return diagnostic.artifactType === "coverage";
}

function claimHasNoEvidenceOrGap(claim) {
  return asList(claim.evidence_refs).length === 0 && asList(claim.gap_refs).length === 0;
}

function sourceAuthorityIsWeak(record) {
  return ["inferred", "unknown"].includes(record.authority_state);
}

export const GATE_PHASES = Object.freeze(phases);
export const GATE_LEVELS = Object.freeze(levels);

export const GATE_CRITERIA = Object.freeze([
  {
    id: "gate.plan.schema-valid",
    phase: "plan",
    level: "hard_fail",
    decision: "fail",
    plain_language: "Do not progress when a SEAL artifact is missing, unparsable, or outside its schema.",
    validator_signal: "validation diagnostic where artifactType is map, impact, proof, or evidenceIndex",
    evidence_needed: "Run seal-validate and fix schema or parse diagnostics.",
    evaluate: (context) => hasDiagnostic(context, isSchemaDiagnostic)
  },
  {
    id: "gate.plan.source-authority-visible",
    phase: "plan",
    level: "hard_fail",
    decision: "fail",
    plain_language: "Every approved plan fact must name its source authority; inferred or unknown authority cannot be approved.",
    validator_signal: "authority diagnostic from seal-validate",
    evidence_needed: "Downgrade approval state, attach a stronger source, or record the uncertainty as a gap.",
    evaluate: (context) => hasDiagnostic(context, (diagnostic) => diagnostic.artifactType === "authority")
  },
  {
    id: "gate.plan.low-confidence-warning",
    phase: "plan",
    level: "warn",
    decision: "warn",
    plain_language: "Low-confidence plan records may be usable for exploration, but they must stay visible before build work depends on them.",
    validator_signal: "map source, requirement, risk, assumption, or gap confidence below 0.5",
    evidence_needed: "Strengthen the source or keep the uncertainty visible in the map.",
    evaluate: (context) => [
      ...asList(context.map?.sources),
      ...asList(context.map?.requirements),
      ...asList(context.map?.risks),
      ...asList(context.map?.assumptions),
      ...asList(context.map?.gaps)
    ].some((record) => typeof record.confidence === "number" && record.confidence < 0.5)
  },
  {
    id: "gate.build.references-intact",
    phase: "build",
    level: "hard_fail",
    decision: "fail",
    plain_language: "Do not build on broken traceability; dangling, duplicate, or unsupported references must be fixed or made into explicit gaps.",
    validator_signal: "reference diagnostic from seal-validate",
    evidence_needed: "Run seal-validate and repair duplicate ids, dangling refs, or invalid links.",
    evaluate: (context) => hasDiagnostic(context, isReferenceDiagnostic)
  },
  {
    id: "gate.build.file-coverage-complete",
    phase: "build",
    level: "hard_fail",
    decision: "fail",
    plain_language: "Every non-ignored repository file must be mapped to a component or have a visible ownership gap.",
    validator_signal: "coverage diagnostic from seal-validate",
    evidence_needed: "Regenerate the map, attach ownership, or add debt backed by a visible gap.",
    evaluate: (context) => hasDiagnostic(context, isCoverageDiagnostic)
  },
  {
    id: "gate.build.open-map-gaps-warning",
    phase: "build",
    level: "warn",
    decision: "warn",
    plain_language: "Open map gaps can remain during build, but the user must see what is still unknown.",
    validator_signal: "map gap with status open or missing status",
    evidence_needed: "Close, accept, or carry the map gap into proof and launch reporting.",
    evaluate: (context) => hasMapGap(context, (gap) => (gap.status ?? "open") === "open")
  },
  {
    id: "gate.prove.claim-has-evidence-or-gap",
    phase: "prove",
    level: "hard_fail",
    decision: "fail",
    plain_language: "A proof claim with neither evidence nor an explicit gap is not proof.",
    validator_signal: "proof claim with empty evidence_refs and empty gap_refs",
    evidence_needed: "Attach accepted evidence or create a proof gap that says what is missing.",
    evaluate: (context) => hasProofClaim(context, claimHasNoEvidenceOrGap)
  },
  {
    id: "gate.prove.no-failed-evidence",
    phase: "prove",
    level: "hard_fail",
    decision: "fail",
    plain_language: "Failed evidence blocks proof until the behavior is fixed or the claim is kept visibly blocked.",
    validator_signal: "evidence index record with status failed",
    evidence_needed: "Fix the failing evidence source, rerun it, or attach a visible proof gap.",
    evaluate: (context) => hasEvidence(context, (evidence) => evidence.status === "failed")
  },
  {
    id: "gate.prove.stale-evidence-warning",
    phase: "prove",
    level: "warn",
    decision: "warn",
    plain_language: "Stale evidence may explain past behavior, but it should not be treated as fresh launch proof.",
    validator_signal: "evidence index record with status stale",
    evidence_needed: "Refresh the evidence or explain why the stale evidence is still acceptable.",
    evaluate: (context) => hasEvidence(context, (evidence) => evidence.status === "stale")
  },
  {
    id: "gate.prove.accepted-gap-warning",
    phase: "prove",
    level: "warn",
    decision: "warn",
    plain_language: "Accepted proof gaps are explicit assumptions, not proven claims.",
    validator_signal: "proof gap with status accepted",
    evidence_needed: "Leave the accepted gap visible in launch decisions until evidence replaces it.",
    evaluate: (context) => hasProofGap(context, (gap) => gap.status === "accepted")
  },
  {
    id: "gate.launch.unmapped-files-block-launch",
    phase: "launch",
    level: "hard_fail",
    decision: "fail",
    plain_language: "The launch report cannot omit unmapped launch files or file coverage failures.",
    validator_signal: "launch report blocker with kind unmapped_file or coverage diagnostic",
    evidence_needed: "Map launch files or include the file coverage blocker in the launch report.",
    evaluate: (context) => hasLaunchReportBlocker(context, (blocker) => blocker.kind === "unmapped_file")
      || hasDiagnostic(context, (diagnostic) => diagnostic.artifactType === "coverage" && diagnostic.code === "unmapped_file")
  },
  {
    id: "gate.launch.known-unknowns-visible",
    phase: "launch",
    level: "hard_fail",
    decision: "fail",
    plain_language: "Launch artifacts must include known unknowns; hidden uncertainty is a launch blocker.",
    validator_signal: "open map or proof gap not listed in launch report known_unknowns",
    evidence_needed: "Add every open map/proof gap to the launch report or close it with evidence.",
    evaluate: (context) => {
      const launchUnknownIds = new Set(asList(context.launchReport?.known_unknowns).map((unknown) => unknown.id));
      const openGapIds = [
        ...asList(context.map?.gaps),
        ...asList(context.proof?.gaps)
      ]
        .filter((gap) => (gap.status ?? "open") === "open")
        .map((gap) => gap.id);

      return openGapIds.some((id) => !launchUnknownIds.has(id));
    }
  },
  {
    id: "gate.launch.pending-approval-warning",
    phase: "launch",
    level: "warn",
    decision: "warn",
    plain_language: "Pending approvals should remain visible in the launch decision even when they do not block exploration.",
    validator_signal: "launch gate, proof claim, or evidence record with approval_state pending",
    evidence_needed: "Record human approval, downgrade the launch decision, or keep approval pending as a visible warning.",
    evaluate: (context) => [
      ...asList(context.map?.launch_gates),
      ...asList(context.proof?.claims),
      ...asList(context.evidenceIndex?.evidence)
    ].some((record) => record.approval_state === "pending")
  },
  {
    id: "gate.launch.weak-authority-warning",
    phase: "launch",
    level: "warn",
    decision: "warn",
    plain_language: "Launch decisions that depend on inferred or unknown authority should say so plainly.",
    validator_signal: "launch report known_unknown or blocker backed by inferred or unknown authority",
    evidence_needed: "Replace weak authority with observed, approved, external, execution, or mathematical evidence.",
    evaluate: (context) => [
      ...asList(context.launchReport?.known_unknowns),
      ...asList(context.launchReport?.blockers)
    ].some(sourceAuthorityIsWeak)
  }
]);

export function criteriaByPhase() {
  return Object.fromEntries(phases.map((phase) => [
    phase,
    GATE_CRITERIA.filter((criterion) => criterion.phase === phase)
  ]));
}

export function evaluateGateCriteria(context = {}) {
  return GATE_CRITERIA
    .filter((criterion) => criterion.evaluate(context))
    .map(({ evaluate, ...criterion }) => criterion);
}

export function getGateCriterion(id) {
  return GATE_CRITERIA.find((criterion) => criterion.id === id);
}
