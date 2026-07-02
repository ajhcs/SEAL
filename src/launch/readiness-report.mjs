import path from "node:path";
import { createArtifactStore } from "../artifacts/store.mjs";
import { evaluateGatePolicy } from "../gates/policy.mjs";
import { evaluateReadinessLevel } from "./readiness-levels.mjs";
import { createMapViews } from "../map/render-views.mjs";
import { createOntologyViewModel, ontologyViewMarkdown } from "../ontology/view-model.mjs";
import { createProofGapReport } from "../proof/gap-report.mjs";
import { validateSealArtifacts } from "../validation/validate.mjs";

const decisionLabels = Object.freeze({
  pass: "Ready",
  warn: "Ready with cautions",
  unknown: "Needs inspection",
  blocked: "Blocked",
  fail: "Do not launch",
});

const decisionReasons = Object.freeze({
  pass: "No blocking gate decision, failed evidence, unresolved proof obligation, or hidden gap is visible.",
  warn: "The work may proceed only with the listed cautions visible to the launch owner.",
  unknown: "SEAL cannot make a launch decision until the listed unknowns are inspected.",
  blocked: "Required proof, approval, or impact work is still open.",
  fail: "A hard validation, coverage, reference, or proof failure must be fixed before launch.",
});

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

function firstSourceRef(...records) {
  for (const record of records) {
    const sourceRef = asList(record?.source_refs)[0];
    if (sourceRef) {
      return sourceRef;
    }
  }
  return "src.unknown";
}

function authorityFor(record, fallbackSourceRef = "src.unknown") {
  return {
    source_refs: asList(record?.source_refs).length > 0 ? record.source_refs : [fallbackSourceRef],
    authority_state: record?.authority_state ?? "repo_observed",
    approval_state: record?.approval_state ?? "not_required",
    confidence: typeof record?.confidence === "number" ? record.confidence : 0.7,
  };
}

function artifactRef(artifact, ref, reason, extra = {}) {
  return {
    artifact,
    ref,
    reason,
    ...extra,
  };
}

function refsText(refs) {
  const values = asList(refs).map((ref) => `${ref.artifact}:${ref.ref}`);
  return values.length > 0 ? values.join(", ") : "none";
}

function markdownCell(value) {
  return String(value ?? "-").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function openGap(gap) {
  return !gap.status || gap.status === "open";
}

function visibleGapRecord(kind, gap, fallbackSourceRef) {
  return {
    id: gap.id,
    kind,
    summary: gap.summary ?? gap.reason ?? `${gap.id} remains unresolved.`,
    status: gap.status ?? "open",
    artifact_refs: [artifactRef(kind === "map_gap" ? "map.gap" : "proof.gap", gap.id, "Open gap is carried into launch reporting.")],
    ...authorityFor(gap, fallbackSourceRef),
  };
}

function validationBlockers(validation) {
  return asList(validation?.diagnostics)
    .filter((diagnostic) => ["map", "impact", "proof", "evidenceIndex", "proof_binding", "reference", "coverage", "authority"].includes(diagnostic.artifactType))
    .map((diagnostic) => ({
      id: `validation.${diagnostic.artifactType}.${diagnostic.path ?? diagnostic.file ?? "issue"}`,
      kind: diagnostic.artifactType === "coverage" ? "unmapped_file" : "validation",
      summary: diagnostic.message ?? `${diagnostic.artifactType} validation failed.`,
      status: "open",
      artifact_refs: [
        artifactRef("validation", diagnostic.path ?? diagnostic.file ?? diagnostic.artifactType, "Validation diagnostic affects launch readiness.", {
          file: diagnostic.file,
          path: diagnostic.path,
        }),
      ],
      source_refs: [diagnostic.file ?? "validation"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.9,
    }));
}

function synthesizeLaunchReport({ validation, map, proof }) {
  const fallbackSourceRef = firstSourceRef(...asList(map?.sources));
  return {
    id: "launch.readiness",
    blockers: validationBlockers(validation),
    known_unknowns: [
      ...asList(map?.gaps).filter(openGap).map((gap) => visibleGapRecord("map_gap", gap, fallbackSourceRef)),
      ...asList(proof?.gaps).filter(openGap).map((gap) => visibleGapRecord("proof_gap", gap, fallbackSourceRef)),
    ],
  };
}

function summarizeMap(map) {
  if (!map) {
    return { components: 0, files: 0, gaps: 0, dependencies: 0, interfaces: 0 };
  }
  return createMapViews(map).summary;
}

function summarizeProof(proof, evidenceIndex, profile) {
  const emptyCounts = { proven: 0, assumed: 0, stale: 0, blocked: 0, failed: 0, invalid: 0 };
  if (!proof) {
    return {
      readiness: "missing",
      counts: emptyCounts,
      claims: [],
    };
  }
  const summary = createProofGapReport({ proof, evidenceIndex, profile });
  return {
    ...summary,
    counts: {
      ...emptyCounts,
      ...summary.counts,
    },
  };
}

function rankDecision(decision) {
  const ranks = { fail: 0, blocked: 1, unknown: 2, warn: 3, pass: 4 };
  return ranks[decision.status] ?? 5;
}

function importantDecisions(policy) {
  return asList(policy.decisions)
    .filter((decision) => decision.status !== "pass")
    .sort((left, right) => rankDecision(left) - rankDecision(right) || left.id.localeCompare(right.id));
}

function topBlockers(policy) {
  return importantDecisions(policy)
    .filter((decision) => ["fail", "blocked"].includes(decision.status))
    .slice(0, 8)
    .map((decision) => ({
      id: decision.id,
      kind: decision.status,
      summary: decision.summary,
      status: decision.status,
      artifact_refs: decision.artifact_refs,
      source_refs: [decision.id],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.9,
    }));
}

function knownUnknowns(policy, launchReport) {
  const launchUnknowns = asList(launchReport.known_unknowns);
  const policyUnknowns = importantDecisions(policy)
    .filter((decision) => decision.status === "unknown")
    .map((decision) => ({
      id: decision.id,
      kind: "gate_unknown",
      summary: decision.summary,
      status: "unknown",
      artifact_refs: decision.artifact_refs,
      source_refs: [decision.id],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.8,
    }));

  const byId = new Map();
  for (const unknown of [...launchUnknowns, ...policyUnknowns]) {
    byId.set(unknown.id, unknown);
  }
  return [...byId.values()];
}

function highRiskAssumptions(map, proof, launchReport) {
  const assumptions = [
    ...asList(map?.assumptions).map((record) => ["map.assumption", record]),
    ...asList(proof?.gaps).filter((gap) => gap.status === "accepted").map((record) => ["proof.gap", record]),
    ...asList(launchReport.known_unknowns).filter((record) => ["inferred", "unknown"].includes(record.authority_state)).map((record) => ["launch.known_unknown", record]),
  ];

  return assumptions
    .filter(([, record]) =>
      record.status === "accepted"
      || record.risk === "high"
      || record.launch_impact === "high"
      || record.authority_state === "inferred"
      || record.authority_state === "unknown"
      || (typeof record.confidence === "number" && record.confidence < 0.5)
    )
    .map(([artifact, record]) => ({
      id: record.id ?? record.summary ?? artifact,
      summary: record.summary ?? record.reason ?? `${artifact} affects launch confidence.`,
      artifact_refs: [artifactRef(artifact, record.id ?? record.summary ?? artifact, "High-risk assumption remains visible.")],
      ...authorityFor(record, firstSourceRef(record)),
    }));
}

function nextActions(policy) {
  return importantDecisions(policy).slice(0, 8).map((decision) => {
    const actionByStatus = {
      fail: "Fix this hard failure, then rerun validation and regenerate the launch report.",
      blocked: "Complete or explicitly gap the required proof, approval, or impact work.",
      unknown: "Inspect the unknown and either map it, prove it, or carry it as an accepted gap.",
      warn: "Get launch-owner acceptance or replace the caution with stronger evidence.",
    };
    return {
      id: `action.${decision.id}`,
      summary: actionByStatus[decision.status] ?? "Review this gate decision.",
      reason: decision.summary,
      artifact_refs: decision.artifact_refs,
    };
  });
}

function traceSummary(report) {
  return [
    artifactRef("validation", "diagnostics", "Launch status includes schema, reference, coverage, and authority validation."),
    artifactRef("map", "summary", "Map coverage contributes component, file, dependency, and gap counts."),
    artifactRef("impact", "records", "Impact records contribute proof obligations, approvals, affected unknowns, and impact gaps."),
    artifactRef("proof", "claims", "Proof claims and evidence decide whether claims are proven, stale, assumed, failed, or blocked."),
    artifactRef("gate.policy", report.policy.overall, "Gate policy turns evidence into the launch decision."),
    artifactRef("rigor.profile", report.profile.id, "Rigor profile sets proportional artifacts, evidence, approvals, and launch gates."),
  ];
}

function formatList(records, emptyText, formatter) {
  if (records.length === 0) {
    return [`- ${emptyText}`];
  }
  return records.map(formatter);
}

function formatMarkdown(report) {
  const lines = [
    "# SEAL Launch Readiness",
    "",
    `Launch decision: **${report.decision.label}**`,
    "",
    report.decision.reason,
    "",
    "## Snapshot",
    "",
    `- Map coverage: ${report.map.components} component(s), ${report.map.files} file(s), ${report.map.gaps} visible gap(s).`,
    `- Impact scope: ${report.impact.records} impact record(s), ${report.impact.open_proof_obligations} open proof obligation(s), ${report.impact.pending_approvals} pending approval(s).`,
    `- Proof status: ${report.proof.readiness}; ${report.proof.counts.proven} proven, ${report.proof.counts.assumed} assumed, ${report.proof.counts.stale} stale, ${report.proof.counts.blocked} blocked, ${report.proof.counts.failed} failed.`,
    `- Gate policy: ${report.policy.overall} (${report.policy.counts.fail} fail, ${report.policy.counts.blocked} blocked, ${report.policy.counts.unknown} unknown, ${report.policy.counts.warn} warn).`,
    `- Readiness level: ${report.readiness_level.id} - ${report.readiness_level.label}.`,
    `- Rigor profile: ${report.profile.label} (${report.profile.id}).`,
    "",
    ontologyViewMarkdown(report.ontology),
    "",
    "## Readiness Level",
    "",
    `**${report.readiness_level.id} - ${report.readiness_level.label}**`,
    "",
    report.readiness_level.summary,
    "",
    "This level is a plain-language summary only. The gate policy, evidence links, blockers, and unknowns remain the launch authority.",
    "",
    ...formatList(report.readiness_level.drivers, "No readiness drivers were found.", (item) => `- ${item.text} [${refsText(item.artifact_refs)}]`),
    `- Next step: ${report.readiness_level.next_action}`,
    "",
    "## Rigor Profile",
    "",
    `**${report.profile.label}** - ${report.profile.summary}`,
    "",
    `- Required artifacts: ${report.profile.required_artifacts.join(", ")}.`,
    `- Evidence: ${report.profile.evidence}`,
    `- Approvals: ${report.profile.approvals}`,
    `- Launch gates: ${report.profile.launch_gates}`,
    "",
    ...formatList(report.escalations, "No profile escalation recommendation was found.", (item) => `- ${item.summary}`),
    "",
    "## Top Blockers",
    "",
    ...formatList(report.blockers, "No launch blockers were found.", (blocker) => `- ${blocker.summary} [${refsText(blocker.artifact_refs)}]`),
    "",
    "## Known Unknowns",
    "",
    ...formatList(report.known_unknowns, "No open unknowns were found.", (unknown) => `- ${unknown.summary} [${refsText(unknown.artifact_refs)}]`),
    "",
    "## High-Risk Assumptions",
    "",
    ...formatList(report.high_risk_assumptions, "No high-risk assumptions were found.", (assumption) => `- ${assumption.summary} [${refsText(assumption.artifact_refs)}]`),
    "",
    "## Gate Decisions",
    "",
    "| Gate | Status | Artifact links | Meaning |",
    "| --- | --- | --- | --- |",
  ];

  for (const decision of importantDecisions(report.policy).slice(0, 12)) {
    lines.push(`| ${markdownCell(decision.id)} | ${markdownCell(decision.status)} | ${markdownCell(refsText(decision.artifact_refs))} | ${markdownCell(decision.summary)} |`);
  }
  if (importantDecisions(report.policy).length === 0) {
    lines.push("| none | pass | none | No non-pass gate decisions were found. |");
  }

  lines.push(
    "",
    "## Next Actions",
    "",
    ...formatList(report.next_actions, "No immediate launch action is required.", (action) => `- ${action.summary} ${action.reason} [${refsText(action.artifact_refs)}]`),
    "",
    "## Trace",
    "",
    ...report.trace.map((ref) => `- ${ref.reason} [${ref.artifact}:${ref.ref}]`),
    "",
  );

  return lines.join("\n");
}

function impactSummary(impacts) {
  return {
    records: impacts.length,
    open_proof_obligations: impacts.flatMap((impact) => asList(impact.proof_required)).filter((record) => record.status === "open").length,
    pending_approvals: impacts.flatMap((impact) => asList(impact.approval_needed)).filter((record) => ["open", "pending", "rejected"].includes(record.status)).length,
    unknown_affected: impacts.flatMap(impactAffectedRecords).filter((record) => record.kind === "unknown").length,
    open_gaps: impacts.flatMap((impact) => asList(impact.gaps)).filter(openGap).length,
  };
}

export function createLaunchReadinessReport({ validation, ontology, trace, map, impacts = [], proof, debt, evidenceIndex, launchReport, profile } = {}) {
  const generatedLaunchReport = launchReport ?? synthesizeLaunchReport({ validation, map, proof });
  const policy = evaluateGatePolicy({
    validation,
    map,
    impacts,
    proof,
    evidenceIndex,
    launchReport: generatedLaunchReport,
    profile,
  }, { profile });

  const mapSummary = summarizeMap(map);
  const impact = impactSummary(impacts);
  const proofSummary = summarizeProof(proof, evidenceIndex, policy.profile.id);
  const readinessLevel = evaluateReadinessLevel({
    validation,
    map: mapSummary,
    impact,
    proof: proofSummary,
    policy,
  });

  const report = {
    id: "launch.readiness",
    decision: {
      status: policy.overall,
      label: decisionLabels[policy.overall],
      reason: decisionReasons[policy.overall],
    },
    readiness_level: readinessLevel,
    map: mapSummary,
    impact,
    proof: proofSummary,
    policy,
    profile: policy.profile,
    ontology: createOntologyViewModel({ ontology, map, trace, proof, debt, impacts }),
    escalations: policy.escalations,
    blockers: [...asList(generatedLaunchReport.blockers), ...topBlockers(policy)],
    known_unknowns: knownUnknowns(policy, generatedLaunchReport),
    high_risk_assumptions: highRiskAssumptions(map, proof, generatedLaunchReport),
    next_actions: nextActions(policy),
  };
  report.trace = traceSummary(report);
  report.markdown = formatMarkdown(report);
  return report;
}

export async function writeLaunchReadinessReport(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const store = createArtifactStore(root);
  const [validation, artifactRead] = await Promise.all([
    validateSealArtifacts(root),
    store.readCanonicalSet({
      keys: ["ontology", "trace", "map", "proof", "debt", "evidenceIndex", "impact"],
      mode: "diagnostic"
    })
  ]);
  const { ontology, trace, map, proof, debt, evidenceIndex, impacts } = artifactRead.artifactSet;

  const report = createLaunchReadinessReport({ validation, ontology, trace, map, impacts, proof, debt, evidenceIndex, profile: options.profile });
  const { filePath: outputPath } = await store.writeDerived("launchReadiness", report.markdown, {
    reason: "write_launch_readiness_report"
  });
  return { report, outputPath };
}
