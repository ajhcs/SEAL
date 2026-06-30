import { GATE_CRITERIA, evaluateGateCriteria } from "./criteria.mjs";

const STATUS_RANK = {
  pass: 0,
  warn: 1,
  unknown: 2,
  blocked: 3,
  fail: 4,
};

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function impactAffectedRecords(impact) {
  if (Array.isArray(impact?.affected_flat)) {
    return impact.affected_flat;
  }
  if (Array.isArray(impact?.affected)) {
    return impact.affected;
  }
  if (impact?.affected && typeof impact.affected === "object") {
    return Object.values(impact.affected).flatMap(asList);
  }
  return [];
}

function definedEntries(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function artifactRef(artifact, ref, reason, extra = {}) {
  return definedEntries({
    artifact,
    ref,
    reason,
    path: extra.path,
    file: extra.file,
    id: extra.id,
    status: extra.status,
    authority_state: extra.authority_state,
    approval_state: extra.approval_state,
  });
}

function recordId(record, fallback) {
  return record?.id ?? record?.path ?? record?.file ?? record?.ref ?? fallback;
}

function mapRecords(map = {}) {
  return [
    ...asList(map.sources).map((record) => ["map.source", record]),
    ...asList(map.requirements).map((record) => ["map.requirement", record]),
    ...asList(map.risks).map((record) => ["map.risk", record]),
    ...asList(map.assumptions).map((record) => ["map.assumption", record]),
    ...asList(map.gaps).map((record) => ["map.gap", record]),
  ];
}

function openGap(gap) {
  return !gap.status || gap.status === "open";
}

function diagnosticRefs(context, artifactTypes, reason) {
  return asList(context.validation?.diagnostics)
    .filter((diagnostic) => artifactTypes.includes(diagnostic.artifactType))
    .map((diagnostic) =>
      artifactRef("validation", diagnostic.path ?? diagnostic.file, reason, {
        file: diagnostic.file,
        path: diagnostic.path,
        status: diagnostic.actual,
      }),
    );
}

function lowConfidenceRefs(context) {
  return mapRecords(context.map)
    .filter(([, record]) => typeof record.confidence === "number" && record.confidence < 0.5)
    .map(([artifact, record]) =>
      artifactRef(artifact, recordId(record, "low-confidence-record"), "Low-confidence fact remains visible.", {
        id: record.id,
        status: `confidence:${record.confidence}`,
        authority_state: record.authority_state,
      }),
    );
}

function openMapGapRefs(context) {
  return asList(context.map?.gaps)
    .filter(openGap)
    .map((gap) =>
      artifactRef("map.gap", recordId(gap, "open-gap"), "Open map gap remains visible.", {
        id: gap.id,
        status: gap.status ?? "open",
        authority_state: gap.authority_state,
      }),
    );
}

function proofClaimRefs(context, predicate, reason) {
  return asList(context.proof?.claims)
    .filter(predicate)
    .map((claim) =>
      artifactRef("proof.claim", recordId(claim, "claim"), reason, {
        id: claim.id,
        status: claim.status,
        authority_state: claim.authority_state,
        approval_state: claim.approval_state,
      }),
    );
}

function proofGapRefs(context, predicate, reason) {
  return asList(context.proof?.gaps)
    .filter(predicate)
    .map((gap) =>
      artifactRef("proof.gap", recordId(gap, "gap"), reason, {
        id: gap.id,
        status: gap.status,
        authority_state: gap.authority_state,
      }),
    );
}

function evidenceRefs(context, predicate, reason) {
  return asList(context.evidenceIndex?.evidence)
    .filter(predicate)
    .map((evidence) =>
      artifactRef("evidence", recordId(evidence, "evidence"), reason, {
        id: evidence.id,
        status: evidence.status,
        authority_state: evidence.authority_state,
        approval_state: evidence.approval_state,
      }),
    );
}

function launchReportRefs(context, predicate, reason) {
  const launchReport = context.launchReport ?? {};
  return [
    ...asList(launchReport.blockers).map((record) => ["launch.blocker", record]),
    ...asList(launchReport.known_unknowns).map((record) => ["launch.known_unknown", record]),
  ]
    .filter(([, record]) => predicate(record))
    .map(([artifact, record]) =>
      artifactRef(artifact, recordId(record, "launch-record"), reason, {
        id: record.id,
        status: record.status ?? record.kind,
        authority_state: record.authority_state,
        approval_state: record.approval_state,
      }),
    );
}

function criteriaEvidence(context, criterion) {
  switch (criterion.id) {
    case "gate.plan.schema-valid":
      return diagnosticRefs(context, ["map", "impact", "proof", "evidenceIndex"], "Schema or parse validation failed.");
    case "gate.plan.source-authority-visible":
      return diagnosticRefs(context, ["authority"], "Source authority is missing, inferred, or unknown for an approved fact.");
    case "gate.plan.low-confidence-warning":
      return lowConfidenceRefs(context);
    case "gate.build.references-intact":
      return diagnosticRefs(context, ["reference"], "Reference integrity validation failed.");
    case "gate.build.file-coverage-complete":
      return diagnosticRefs(context, ["coverage"], "Repository file coverage is incomplete.");
    case "gate.build.open-map-gaps-warning":
      return openMapGapRefs(context);
    case "gate.prove.claim-has-evidence-or-gap":
      return proofClaimRefs(
        context,
        (claim) => asList(claim.evidence_refs).length === 0 && asList(claim.gap_refs).length === 0,
        "Claim has neither evidence nor a visible gap.",
      );
    case "gate.prove.no-failed-evidence":
      return evidenceRefs(context, (evidence) => evidence.status === "failed", "Failed evidence blocks proof.");
    case "gate.prove.stale-evidence-warning":
      return evidenceRefs(context, (evidence) => evidence.status === "stale", "Stale evidence remains visible.");
    case "gate.prove.accepted-gap-warning":
      return proofGapRefs(context, (gap) => gap.status === "accepted", "Accepted proof gap is an assumption.");
    case "gate.launch.unmapped-files-block-launch":
      return [
        ...launchReportRefs(context, (record) => record.kind === "unmapped_file", "Launch report contains an unmapped file blocker."),
        ...asList(context.validation?.diagnostics)
          .filter((diagnostic) => diagnostic.artifactType === "coverage" && diagnostic.actual === "unmapped_file")
          .map((diagnostic) =>
            artifactRef("validation", diagnostic.path ?? diagnostic.file, "Coverage validation found an unmapped launch file.", {
              file: diagnostic.file,
              path: diagnostic.path,
              status: diagnostic.actual,
            }),
          ),
      ];
    case "gate.launch.known-unknowns-visible":
      return [
        ...openMapGapRefs(context),
        ...proofGapRefs(context, openGap, "Open proof gap must appear in launch known unknowns."),
      ];
    case "gate.launch.pending-approval-warning":
      return [
        ...asList(context.map?.launch_gates)
          .filter((gate) => gate.approval_state === "pending")
          .map((gate) => artifactRef("map.launch_gate", recordId(gate, "launch-gate"), "Launch approval is pending.", gate)),
        ...proofClaimRefs(context, (claim) => claim.approval_state === "pending", "Proof claim approval is pending."),
        ...evidenceRefs(context, (evidence) => evidence.approval_state === "pending", "Evidence approval is pending."),
      ];
    case "gate.launch.weak-authority-warning":
      return launchReportRefs(
        context,
        (record) => ["inferred", "unknown"].includes(record.authority_state),
        "Launch decision depends on weak source authority.",
      );
    default:
      return [];
  }
}

function decisionFromCriterion(context, criterion, triggered) {
  const status = triggered ? (criterion.level === "hard_fail" ? "fail" : "warn") : "pass";
  const refs = triggered ? criteriaEvidence(context, criterion) : [];
  return {
    id: criterion.id,
    phase: criterion.phase,
    status,
    level: criterion.level,
    summary: criterion.plain_language,
    artifact_refs: refs.length > 0 || !triggered ? refs : [artifactRef("gate.criteria", criterion.id, "Criterion triggered without a record-level pointer.")],
  };
}

function impactRecords(context) {
  return [...asList(context.impacts), ...(context.impact ? [context.impact] : [])];
}

function impactDecisions(context) {
  const decisions = [];

  for (const impact of impactRecords(context)) {
    for (const requirement of asList(impact.proof_required)) {
      if (requirement.status === "open") {
        decisions.push({
          id: `gate.impact.proof-required.${impact.id ?? "impact"}.${requirement.id ?? "open"}`,
          phase: "prove",
          status: "blocked",
          level: "hard_fail",
          summary: "Impact analysis requires proof before launch can proceed.",
          artifact_refs: [
            artifactRef("impact.proof_required", requirement.id ?? impact.id, "Open proof obligation blocks launch.", {
              id: requirement.id,
              status: requirement.status,
            }),
          ],
        });
      }
    }

    for (const approval of asList(impact.approval_needed)) {
      if (["open", "pending", "rejected"].includes(approval.status)) {
        decisions.push({
          id: `gate.impact.approval.${impact.id ?? "impact"}.${approval.id ?? "open"}`,
          phase: "launch",
          status: "blocked",
          level: "hard_fail",
          summary: "Required approval is not complete.",
          artifact_refs: [
            artifactRef("impact.approval_needed", approval.id ?? impact.id, "Approval must be resolved before launch.", {
              id: approval.id,
              status: approval.status,
              approval_state: approval.status,
            }),
          ],
        });
      }
    }

    for (const affected of impactAffectedRecords(impact)) {
      if (affected.kind === "unknown") {
        decisions.push({
          id: `gate.impact.unknown.${impact.id ?? "impact"}.${affected.id ?? "affected"}`,
          phase: "build",
          status: "unknown",
          level: "warn",
          summary: "Impact analysis found an affected area that is still unknown.",
          artifact_refs: [
            artifactRef("impact.affected", affected.id ?? impact.id, "Unknown affected area must stay visible.", {
              id: affected.id,
              status: affected.kind,
              authority_state: affected.authority_state,
            }),
          ],
        });
      }
    }

    for (const gap of asList(impact.gaps)) {
      if (!gap.status || gap.status === "open") {
        decisions.push({
          id: `gate.impact.gap.${impact.id ?? "impact"}.${gap.id ?? "open"}`,
          phase: "launch",
          status: "unknown",
          level: "warn",
          summary: "Impact analysis has a visible unresolved gap.",
          artifact_refs: [
            artifactRef("impact.gap", gap.id ?? impact.id, "Unresolved impact gap must stay visible.", {
              id: gap.id,
              status: gap.status ?? "open",
              authority_state: gap.authority_state,
            }),
          ],
        });
      }
    }
  }

  return decisions;
}

function summarize(decisions) {
  return decisions.reduce(
    (summary, decision) => {
      summary[decision.status] += 1;
      summary.by_phase[decision.phase] ??= { pass: 0, fail: 0, warn: 0, blocked: 0, unknown: 0 };
      summary.by_phase[decision.phase][decision.status] += 1;
      return summary;
    },
    {
      pass: 0,
      fail: 0,
      warn: 0,
      blocked: 0,
      unknown: 0,
      by_phase: {},
    },
  );
}

function overallStatus(decisions) {
  return decisions.reduce((current, decision) => (STATUS_RANK[decision.status] > STATUS_RANK[current] ? decision.status : current), "pass");
}

export function evaluateGatePolicy(context = {}) {
  const triggered = new Set(evaluateGateCriteria(context).map((result) => result.id));
  const criteriaDecisions = GATE_CRITERIA.map((criterion) => decisionFromCriterion(context, criterion, triggered.has(criterion.id)));
  const decisions = [...criteriaDecisions, ...impactDecisions(context)];
  const counts = summarize(decisions);

  return {
    overall: overallStatus(decisions),
    counts,
    decisions,
  };
}

export function formatGatePolicyReport(report) {
  const lines = [
    "# SEAL Gate Policy Report",
    "",
    `Overall status: ${report.overall}`,
    "",
    "| Gate | Phase | Status | Artifact links | Summary |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const decision of report.decisions) {
    const refs = decision.artifact_refs.map((ref) => `${ref.artifact}:${ref.ref}`).join(", ") || "-";
    lines.push(`| ${decision.id} | ${decision.phase} | ${decision.status} | ${refs} | ${decision.summary} |`);
  }

  return `${lines.join("\n")}\n`;
}
