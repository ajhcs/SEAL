import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseYamlArtifact } from "../artifacts/schema-registry.mjs";
import { createArtifactStore } from "../artifacts/store.mjs";
import { GENERATED_VIEW_NOTICE } from "../contracts/constants.mjs";
import { createLaunchReadinessReport } from "../launch/readiness-report.mjs";
import { createOntologyViewModel, ontologyViewMarkdown } from "../ontology/view-model.mjs";
import { createProofGapReport } from "../proof/gap-report.mjs";
import { validateSealArtifacts } from "../validation/validate.mjs";

export const DASHBOARD_VIEW_PATH = ".seal/views/dashboard.md";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function compact(values) {
  return values.filter((value) => value !== undefined && value !== null && value !== "");
}

function uniq(values) {
  return [...new Set(compact(values))];
}

function limit(records, count = 8) {
  return records.slice(0, count);
}

function recordId(record, fallback = "unknown") {
  return record?.id ?? record?.claim?.id ?? record?.path ?? record?.name ?? record?.subject ?? fallback;
}

function valueSummary(value, fallback = "not recorded") {
  if (value && typeof value === "object" && typeof value.summary === "string") {
    return value.summary;
  }
  if (value && typeof value === "object" && typeof value.missing === "string") {
    return value.missing;
  }
  if (value && typeof value === "object" && typeof value.reason === "string") {
    return value.reason;
  }
  if (value && typeof value === "object" && typeof value.statement === "string") {
    return value.statement;
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return fallback;
}

function recordSummary(record, fallback = "not recorded") {
  return valueSummary(
    record?.summary
      ?? record?.missing
      ?? record?.reason
      ?? record?.statement
      ?? record?.claim?.statement
      ?? record?.reasons?.[0]
      ?? record?.name
      ?? record?.path
      ?? record?.id,
    fallback
  );
}

function refValue(ref) {
  if (typeof ref === "string") {
    return ref;
  }
  if (ref && typeof ref === "object") {
    if (ref.artifact && ref.ref) {
      return `${ref.artifact}:${ref.ref}`;
    }
    return ref.id ?? ref.path ?? ref.name;
  }
  return undefined;
}

function sourceRefs(record) {
  return asList(record?.source_refs ?? record?.claim?.source_refs)
    .map(refValue)
    .filter(Boolean)
    .map((sourceRef) => `source:${sourceRef}`);
}

function artifactRefs(record) {
  return asList(record?.artifact_refs ?? record?.artifactRefs)
    .map(refValue)
    .filter(Boolean)
    .map((artifactRef) => `artifact:${artifactRef}`);
}

function evidenceRefs(record) {
  return asList(record?.evidence_refs ?? record?.evidenceRefs ?? record?.claim?.evidence_refs)
    .map(refValue)
    .filter(Boolean)
    .map((evidenceRef) => `evidence:${evidenceRef}`);
}

function gapRefs(record) {
  return asList(record?.gap_refs ?? record?.gapRefs ?? record?.claim?.gap_refs)
    .map(refValue)
    .filter(Boolean)
    .map((gapRef) => `gap:${gapRef}`);
}

function refs(record, fallback, extras = []) {
  return `[${uniq([
    ...extras,
    ...artifactRefs(record),
    ...sourceRefs(record),
    ...evidenceRefs(record),
    ...gapRefs(record),
    fallback
  ]).join(" ")}]`;
}

function notRecorded(domain) {
  return `not recorded [gap:not-recorded.${domain}]`;
}

function isOpen(record) {
  return !["closed", "resolved", "approved", "not_required", "none"].includes(String(record?.status ?? record?.approval_state ?? "").toLowerCase());
}

function impactAffectedRecords(impact) {
  if (Array.isArray(impact?.affected_flat)) {
    return impact.affected_flat;
  }
  if (Array.isArray(impact?.affected)) {
    return impact.affected;
  }
  if (impact?.affected && typeof impact.affected === "object") {
    return Object.entries(impact.affected).flatMap(([kind, records]) =>
      asList(records).map((record) =>
        typeof record === "string" ? { id: record, kind } : { kind, ...record }
      )
    );
  }
  return [];
}

function collectMapUnknowns(map) {
  const componentUnknowns = asList(map?.components).flatMap((component) => [
    ...asList(component.unknowns).map((unknown) => ({ ...unknown, component_id: recordId(component) })),
    ...asList(component.proof_gaps).map((gap) => ({ ...gap, component_id: recordId(component) }))
  ]);

  return [
    ...asList(map?.unknowns),
    ...asList(map?.gaps),
    ...componentUnknowns
  ];
}

function collectImpactUnknowns(impacts) {
  return impacts.flatMap((impact) => [
    ...asList(impact.blocking_unknowns).map((unknown) => ({ ...unknown, impact_id: recordId(impact) })),
    ...asList(impact.gaps).map((gap) => ({ ...gap, impact_id: recordId(impact) })),
    ...impactAffectedRecords(impact)
      .filter((record) => record?.kind === "unknown" || /unknown/i.test(record?.id ?? ""))
      .map((record) => ({ ...record, impact_id: recordId(impact) }))
  ]);
}

function collectOpenProofGaps(proof) {
  return asList(proof?.gaps).filter((gap) => gap.status !== "closed");
}

function collectServices(map) {
  if (Array.isArray(map?.services)) {
    return map.services;
  }
  return asList(map?.services?.discovered);
}

function collectServiceGaps(map) {
  if (Array.isArray(map?.services?.gaps)) {
    return map.services.gaps;
  }
  return asList(map?.service_discovery?.gaps);
}

function collectDependencies(map) {
  const explicit = asList(map?.dependencies ?? map?.observed?.dependencies);
  const componentDependencies = asList(map?.components).flatMap((component) =>
    asList(component.dependencies).map((dependency) => ({
      id: `${recordId(component)} -> ${typeof dependency === "string" ? dependency : recordId(dependency)}`,
      source: recordId(component),
      target: typeof dependency === "string" ? dependency : recordId(dependency),
      source_refs: component.source_refs
    }))
  );
  return [...explicit, ...componentDependencies];
}

function collectDebtRecords(debt) {
  return asList(debt?.records);
}

function collectRiskRecords({ map, impacts, debt }) {
  const debtRecords = collectDebtRecords(debt);
  const changedServices = impacts.filter((impact) => impact?.dependency_service_cost_impact?.services_changed);
  const changedDependencies = impacts.filter((impact) => impact?.dependency_service_cost_impact?.dependencies_changed);
  const costImpacts = impacts.filter((impact) => {
    const cost = impact?.dependency_service_cost_impact;
    return asList(cost?.new_runtime_costs).length > 0 || asList(cost?.unknown_costs).length > 0 || asList(cost?.removed_runtime_costs).length > 0;
  });
  const affectedRecords = impacts.flatMap(impactAffectedRecords);
  const securityPattern = /(security|privacy|auth|access|permission|secret|token)/i;

  return {
    services: [
      ...collectServices(map),
      ...collectServiceGaps(map),
      ...debtRecords.filter((record) => /service/i.test(record.type ?? "")),
      ...changedServices
    ],
    dependencies: [
      ...collectDependencies(map),
      ...debtRecords.filter((record) => /dependency/i.test(record.type ?? "")),
      ...changedDependencies
    ],
    cost: [
      ...collectServices(map).filter((service) => !["", "none", "free", "not_applicable"].includes(String(service.cost_model ?? "").toLowerCase())),
      ...debtRecords.filter((record) => /cost/i.test(`${record.type ?? ""} ${record.summary ?? ""} ${record.subject ?? ""}`)),
      ...costImpacts
    ],
    data: [
      ...asList(map?.data_stores),
      ...collectServices(map).filter((service) => !["", "none", "low", "not_applicable"].includes(String(service.data_risk ?? "").toLowerCase())),
      ...affectedRecords.filter((record) => /data/i.test(`${record.kind ?? ""} ${record.id ?? ""}`))
    ],
    security: [
      ...asList(map?.risks).filter((record) => securityPattern.test(`${record.id ?? ""} ${record.summary ?? ""} ${record.reason ?? ""}`)),
      ...debtRecords.filter((record) => securityPattern.test(`${record.type ?? ""} ${record.subject ?? ""} ${record.summary ?? ""}`)),
      ...collectMapUnknowns(map).filter((record) => securityPattern.test(recordSummary(record, ""))),
      ...collectImpactUnknowns(impacts).filter((record) => securityPattern.test(recordSummary(record, "")))
    ]
  };
}

function proofCounts(proof, proofReport) {
  const reportClaims = asList(proofReport?.claims);
  const rawClaims = asList(proof?.claims);
  const counts = {
    proven: 0,
    stale: 0,
    failed: 0,
    blocked: 0,
    assumed: 0,
    gapped: rawClaims.filter((claim) => claim.status === "gapped").length,
    invalid: 0
  };

  for (const claim of reportClaims) {
    if (counts[claim.status] !== undefined) {
      counts[claim.status] += 1;
    }
  }
  return counts;
}

function markdownList(records, formatter, emptyLine) {
  if (records.length === 0) {
    return emptyLine;
  }
  return records.map(formatter).join("\n");
}

function renderProject(map) {
  const purpose = map?.purpose;
  const boundary = map?.boundary;
  const included = asList(boundary?.included).length;
  const excluded = asList(boundary?.excluded).length;

  return [
    `- Purpose: ${recordSummary(purpose, "not recorded")} ${refs(purpose, "map:purpose")}`,
    boundary
      ? `- Boundary: root \`${boundary.root ?? "."}\`; includes ${included} path(s); excludes ${excluded} path(s). ${refs(boundary, "map:boundary")}`
      : `- Boundary: ${notRecorded("project.boundary")}`
  ].join("\n");
}

function renderReadiness(launchReport) {
  return [
    `- Launch decision: ${launchReport.decision.label} (${launchReport.decision.status}). [launch:launch.readiness gate-policy:${launchReport.policy.overall}]`,
    `- Readiness level: ${launchReport.readiness_level.id} - ${launchReport.readiness_level.label}. [launch:launch.readiness readiness:${launchReport.readiness_level.id}]`,
    `- Rigor profile: ${launchReport.profile.label} (${launchReport.profile.id}). [rigor.profile:${launchReport.profile.id}]`
  ].join("\n");
}

function renderUnknowns(map, impacts, proof, launchReport) {
  const unknowns = [
    ...collectMapUnknowns(map),
    ...collectOpenProofGaps(proof),
    ...collectImpactUnknowns(impacts),
    ...asList(launchReport.known_unknowns),
    ...asList(launchReport.high_risk_assumptions)
  ];
  return markdownList(
    limit(unknowns),
    (record) => `- ${recordId(record)}: ${recordSummary(record, "Unknown needs resolution.")} ${refs(record, `gap:${recordId(record)}`)}`,
    `- Open unknowns/gaps: ${notRecorded("unknowns")}`
  );
}

function renderProofHealth(proof, evidenceIndex, proofReport) {
  const counts = proofCounts(proof, proofReport);
  const lines = [
    `- Claims: proven ${counts.proven}; stale ${counts.stale}; failed ${counts.failed}; blocked ${counts.blocked}; assumed ${counts.assumed}; gapped ${counts.gapped}; invalid ${counts.invalid}. [proof:claims evidence:index]`
  ];
  const proven = asList(proofReport.claims).filter((claim) => claim.status === "proven");
  if (proven.length > 0) {
    lines.push(...limit(proven, 3).map((claim) =>
      `- Proven claim ${recordId(claim)}: ${recordSummary(claim, "Current accepted evidence is linked.")} ${refs(claim, `proof:${recordId(claim)}`)}`
    ));
  }
  const nonProven = asList(proofReport.claims).filter((claim) => claim.status !== "proven");
  if (nonProven.length > 0) {
    lines.push(...limit(nonProven, 5).map((claim) =>
      `- ${recordId(claim)}: ${claim.status} - ${recordSummary(claim, "Proof claim requires attention.")} ${refs(claim, `proof:${recordId(claim)}`)}`
    ));
  } else if (asList(proof?.claims).length > 0 && proven.length === 0) {
    lines.push("- Recorded claims are proven by current non-gap evidence. [proof:claims evidence:index]");
  } else if (asList(proof?.claims).length === 0) {
    lines.push(`- Claim details: ${notRecorded("proof.claims")}`);
  }

  if (asList(evidenceIndex?.evidence).length === 0 && asList(proof?.evidence).length === 0) {
    lines.push(`- Evidence index: ${notRecorded("proof.evidence")}`);
  }
  return lines.join("\n");
}

function renderBlockersAndApprovals(launchReport, impacts) {
  const blockers = asList(launchReport.blockers);
  const approvals = impacts.flatMap((impact) =>
    asList(impact.approval_needed)
      .filter(isOpen)
      .map((approval) => ({ ...approval, impact_id: recordId(impact) }))
  );
  const lines = [];
  lines.push(markdownList(
    limit(blockers),
    (blocker) => `- Blocker ${recordId(blocker)}: ${recordSummary(blocker, "Launch blocker requires resolution.")} ${refs(blocker, `blocker:${recordId(blocker)}`)}`,
    `- Launch blockers: ${notRecorded("launch.blockers")}`
  ));
  lines.push(markdownList(
    limit(approvals),
    (approval) => `- Approval ${recordId(approval)}: ${recordSummary(approval, "Approval is pending.")} ${refs(approval, `impact:${approval.impact_id}`)}`,
    `- Pending approvals: ${notRecorded("launch.approvals")}`
  ));
  return lines.join("\n");
}

function renderRiskDomain(label, domain, records) {
  if (records.length === 0) {
    return `- ${label}: ${notRecorded(`risks.${domain}`)}`;
  }
  const first = records[0];
  const extra = records.length > 1 ? `; ${records.length - 1} more record(s)` : "";
  return `- ${label}: ${recordId(first)} - ${recordSummary(first, "risk recorded")}${extra}. ${refs(first, `risk:${domain}`)}`;
}

function renderRisks({ map, impacts, debt }) {
  const risks = collectRiskRecords({ map, impacts, debt });
  return [
    renderRiskDomain("Services", "services", risks.services),
    renderRiskDomain("Dependencies", "dependencies", risks.dependencies),
    renderRiskDomain("Cost", "cost", risks.cost),
    renderRiskDomain("Data", "data", risks.data),
    renderRiskDomain("Security", "security", risks.security)
  ].join("\n");
}

function renderRecentChanges(impacts, auditWrites) {
  const impactLines = limit(impacts, 5).map((impact) =>
    `- Impact ${recordId(impact)}: ${recordSummary(impact.change, recordSummary(impact, "Change recorded."))} ${refs(impact.change ?? impact, `impact:${recordId(impact)}`)}`
  );
  const auditLines = limit(auditWrites, 5).map((write) => {
    const artifact = write.artifact ?? write.path ?? write.file ?? "artifact";
    const summary = write.summary ?? write.action ?? "artifact write recorded";
    return `- Audit ${artifact}: ${summary} [audit:artifact-writes line:${write.line ?? "unknown"} artifact:${artifact}]`;
  });
  return markdownList(
    [...impactLines, ...auditLines],
    (line) => line,
    `- Recent changes: ${notRecorded("recent-changes")}`
  );
}

function renderNextActions(launchReport) {
  return markdownList(
    limit(asList(launchReport.next_actions)),
    (action) => `- ${recordId(action)}: ${recordSummary(action, "Next action recorded.")} ${refs(action, `launch:launch.readiness`, [`gate-policy:${launchReport.policy.overall}`])}`,
    `- Next actions: ${notRecorded("next-actions")}`
  );
}

function renderLinks() {
  return [
    "- Repo map: `.seal/views/repo-map.md`. [artifact:.seal/views/repo-map.md]",
    "- System map: `.seal/views/system-map.mmd`. [artifact:.seal/views/system-map.mmd]",
    "- Component graph: `.seal/views/component-graph.mmd`. [artifact:.seal/views/component-graph.mmd]",
    "- Interface/data-flow map: `.seal/views/interface-data-flow.mmd`. [artifact:.seal/views/interface-data-flow.mmd]",
    "- Artifact index: `.seal/index.yaml`. [artifact:.seal/index.yaml]",
    "- Proof gap report: `.seal/reports/proof-gaps.md`. [artifact:.seal/reports/proof-gaps.md]",
    "- Launch readiness: `.seal/reports/launch-readiness.md`. [artifact:.seal/reports/launch-readiness.md]"
  ].join("\n");
}

export function createDashboard({ validation, ontology, trace, map, impacts = [], proof, evidenceIndex, debt, auditWrites = [], profile } = {}) {
  const launchReport = createLaunchReadinessReport({
    validation,
    map,
    impacts,
    proof,
    evidenceIndex,
    profile
  });
  const proofReport = createProofGapReport({
    proof,
    evidenceIndex,
    profile: launchReport.profile.id
  });
  const ontologyModel = createOntologyViewModel({ ontology, map, trace, proof, debt, impacts });

  const markdown = `# SEAL Dashboard

${GENERATED_VIEW_NOTICE}

This is a non-authoritative generated view. Canonical SEAL artifacts remain under \`.seal/*.yaml\`; use linked reports for detailed evidence. [artifact:.seal/index.yaml artifact:.seal/map.yaml artifact:.seal/proof.yaml]

## Project

${renderProject(map)}

${ontologyViewMarkdown(ontologyModel)}

## Readiness

${renderReadiness(launchReport)}

## Unknowns And Gaps

${renderUnknowns(map, impacts, proof, launchReport)}

## Proof Health

${renderProofHealth(proof, evidenceIndex, proofReport)}

## Blockers And Approvals

${renderBlockersAndApprovals(launchReport, impacts)}

## Risks

${renderRisks({ map, impacts, debt })}

## Recent Changes

${renderRecentChanges(impacts, auditWrites)}

## Next Actions

${renderNextActions(launchReport)}

## Links

${renderLinks()}
`;

  return {
    id: "dashboard",
    launch: launchReport,
    proof: proofReport,
    ontology: ontologyModel,
    markdown
  };
}

async function readAuditWrites(rootPath) {
  const auditPath = path.join(rootPath, ".seal", "audit", "artifact-writes.jsonl");
  try {
    const raw = await readFile(auditPath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line, index) => ({ raw: line, line: index + 1 }))
      .filter((entry) => entry.raw.trim().length > 0)
      .map((entry) => {
        try {
          return { line: entry.line, ...JSON.parse(entry.raw) };
        } catch {
          return { line: entry.line, artifact: auditPath, summary: "invalid audit JSON line" };
        }
      });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function writeDashboard(rootPath, options = {}) {
  const store = createArtifactStore(rootPath);
  const validation = await validateSealArtifacts(rootPath);
  const artifactRead = await store.readCanonicalSet({
    keys: ["ontology", "trace", "proof", "evidenceIndex", "debt", "impact"],
    validate: true,
    mode: "fail-fast"
  });
  const ontology = artifactRead.artifactSet.ontology;
  const trace = artifactRead.artifactSet.trace;
  const map = artifactRead.artifactSet.map ?? await parseYamlArtifact(store.pathFor("map"));
  const proof = artifactRead.artifactSet.proof ?? { claims: [], evidence: [], gaps: [] };
  const evidenceIndex = artifactRead.artifactSet.evidenceIndex ?? { evidence: [] };
  const debt = artifactRead.artifactSet.debt;
  const impacts = artifactRead.artifactSet.impacts;
  const auditWrites = await readAuditWrites(rootPath);
  const dashboard = createDashboard({
    validation,
    ontology,
    trace,
    map,
    impacts,
    proof,
    evidenceIndex,
    debt,
    auditWrites,
    profile: options.profile
  });

  const { filePath: outputPath } = await store.writeDerived("dashboard", dashboard.markdown, {
    reason: "write_dashboard"
  });
  return { dashboard, report: dashboard, outputPath };
}
