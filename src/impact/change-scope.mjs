import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringifyArtifact } from "../artifacts/generate.mjs";
import { parseYamlArtifact } from "../artifacts/schema-registry.mjs";
import { CONTRACT_SCHEMA_VERSION, TRACE_RELATION_TYPES } from "../contracts/constants.mjs";
import { CLAIM_EVIDENCE_TYPES } from "../proof/taxonomy.mjs";

const unknownDomains = Object.freeze(["interface", "invariant", "service", "dependency", "cost"]);
const traversableRelationshipTypes = new Set(TRACE_RELATION_TYPES);

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function slugify(value, fallback = "change") {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function safeId(prefix, value) {
  return `${prefix}.${slugify(value, "record")}`;
}

function firstSourceId(map) {
  return map.sources?.[0]?.id ?? "src.unknown";
}

function sourceRefsFor(record, fallbackSourceId) {
  return Array.isArray(record?.source_refs) && record.source_refs.length > 0
    ? record.source_refs
    : [fallbackSourceId];
}

function authorityFrom(record, fallbackSourceId) {
  return {
    source_refs: sourceRefsFor(record, fallbackSourceId),
    authority_state: record?.authority_state ?? "repo_observed",
    approval_state: record?.approval_state ?? "pending",
    confidence: typeof record?.confidence === "number" ? record.confidence : 0.7
  };
}

function classifyFileImpact(file) {
  const filePath = normalizePath(file.path);
  if (file.classification === "test" || /(^|\/)(tests?|__tests__)\//i.test(filePath) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(filePath)) {
    return "test";
  }
  if (/schema/i.test(filePath) || /\.schema\.(json|ya?ml)$/i.test(filePath)) {
    return "schema";
  }
  return "file";
}

function buildIndexes(map, proof) {
  const components = new Map((map.components ?? []).map((component) => [component.id, component]));
  const files = new Map((map.files ?? []).map((file) => [normalizePath(file.path), file]));
  const interfaces = new Map((map.interfaces ?? []).map((record) => [record.id, record]));
  const tests = new Map((map.tests ?? []).map((record) => [record.id ?? record.path, record]));
  const gaps = new Map([...(map.gaps ?? []), ...(map.unknowns ?? []), ...(proof?.gaps ?? [])].map((gap) => [gap.id, gap]));
  const evidence = new Map((proof?.evidence ?? []).map((record) => [record.id, record]));
  const requirements = new Map([...(map.requirements ?? []), ...(map.approved?.requirements ?? [])].map((requirement) => [requirement.id, requirement]));
  const risks = new Map((map.risks ?? []).map((risk) => [risk.id, risk]));
  const gates = new Map((map.launch_gates ?? []).map((gate) => [gate.id, gate]));
  const claims = new Map((proof?.claims ?? []).map((claim) => [claim.id, claim]));
  const byId = new Map([
    ...[...components].map(([id, record]) => [id, { kind: "component", record }]),
    ...[...files].map(([id, record]) => [id, { kind: classifyFileImpact(record), record }]),
    ...[...interfaces].map(([id, record]) => [id, { kind: "interface", record }]),
    ...[...tests].map(([id, record]) => [id, { kind: "test", record }]),
    ...[...gaps].map(([id, record]) => [id, { kind: "gap", record }]),
    ...[...requirements].map(([id, record]) => [id, { kind: "requirement", record }]),
    ...[...risks].map(([id, record]) => [id, { kind: "risk", record }]),
    ...[...gates].map(([id, record]) => [id, { kind: "gate", record }]),
    ...[...claims].map(([id, record]) => [id, { kind: "proof", record }]),
    ...[...evidence].map(([id, record]) => [id, { kind: "evidence", record }])
  ]);

  return { components, files, interfaces, tests, gaps, evidence, requirements, risks, gates, claims, byId };
}

function addGraphEdge(graph, from, to, type, source) {
  if (!from || !to) {
    return;
  }
  if (!graph.has(from)) {
    graph.set(from, []);
  }
  if (!graph.has(to)) {
    graph.set(to, []);
  }
  graph.get(from).push({ id: to, type, source });
  graph.get(to).push({ id: from, type, source });
}

function buildOntologyGraph(map, proof) {
  const graph = new Map();
  const unsupported = [];

  for (const relation of [...(map.relationships ?? []), ...(map.trace_links ?? [])]) {
    const type = relation.type ?? relation.relationship;
    const from = relation.from_id ?? relation.from;
    const to = relation.to_id ?? relation.to;
    if (!traversableRelationshipTypes.has(type)) {
      unsupported.push({ type, relation });
      continue;
    }
    addGraphEdge(graph, from, to, type, relation);
  }

  for (const claim of proof?.claims ?? []) {
    for (const evidenceId of claim.evidence_refs ?? []) {
      addGraphEdge(graph, claim.id, evidenceId, "proven_by", claim);
    }
    for (const gapId of claim.gap_refs ?? []) {
      addGraphEdge(graph, claim.id, gapId, "gapped_by", claim);
    }
  }
  for (const evidence of proof?.evidence ?? []) {
    for (const claimId of evidence.supports ?? []) {
      addGraphEdge(graph, evidence.id, claimId, "verifies", evidence);
    }
  }

  return { graph, unsupported };
}

function collectGraphIds(graph, seedIds, maxDepth = 4) {
  const seen = new Set();
  const queue = [...seedIds].filter(Boolean).map((id) => ({ id, depth: 0 }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    if (depth >= maxDepth) {
      continue;
    }
    for (const neighbor of graph.get(id) ?? []) {
      if (!seen.has(neighbor.id)) {
        queue.push({ id: neighbor.id, depth: depth + 1 });
      }
    }
  }

  return seen;
}

function hasSourceOverlap(record, sourceRefs) {
  return sourceRefsFor(record, "").some((sourceRef) => sourceRefs.has(sourceRef));
}

function addGap(gaps, domain, sourceId, summary, reason, severity = "warning") {
  const id = safeId("gap.impact", domain);
  if (gaps.some((gap) => gap.id === id)) {
    return;
  }
  gaps.push({
    id,
    summary,
    missing: summary,
    reason,
    closure_method: "inspect_and_update_contract",
    blocks: ["SRL-4"],
    severity,
    source_refs: [sourceId],
    authority_state: "repo_observed",
    approval_state: "not_required",
    confidence: 0.8,
    status: "open"
  });
}

function proofObligationForAffected(affectedRecord, proofClaims, sourceId) {
  const subject = affectedRecord.ref ?? affectedRecord.id;
  const base = {
    id: safeId(`proof.${slugify(affectedRecord.kind)}`, affectedRecord.id),
    summary: `Prove ${affectedRecord.kind} ${subject} remains valid.`,
    affected_kind: affectedRecord.kind,
    affected_id: subject,
    reason: affectedRecord.reason,
    method: "inspect_and_verify",
    source_refs: sourceRefsFor(affectedRecord, sourceId),
    authority_state: affectedRecord.authority_state ?? "repo_observed",
    approval_state: affectedRecord.approval_state ?? "pending",
    confidence: typeof affectedRecord.confidence === "number" ? affectedRecord.confidence : 0.7,
    status: "open"
  };

  switch (affectedRecord.kind) {
    case "test":
      return {
        ...base,
        method: "run_test",
        evidence_type: "test_result",
        validation_method: "command",
        action: `Run the affected test file ${subject} and attach the command output.`
      };
    case "file":
      return {
        ...base,
        method: "static_review",
        evidence_type: "static_inspection",
        validation_method: "static_review",
        action: `Review changed implementation file ${subject} and link it to a claim or gap.`
      };
    case "schema":
      return {
        ...base,
        method: "schema_validation",
        evidence_type: "static_inspection",
        validation_method: "static_review",
        action: `Validate schema or contract file ${subject} and record compatibility evidence.`
      };
    case "requirement":
      return {
        ...base,
        method: "acceptance_review",
        evidence_type: "human_approval",
        validation_method: "manual_validation",
        action: `Confirm requirement ${subject} still holds after the proposed change.`
      };
    case "risk":
      return {
        ...base,
        method: "risk_review",
        evidence_type: "human_approval",
        validation_method: "human_approval",
        action: `Review risk ${subject} and approve, reject, or gap the mitigation evidence.`
      };
    case "proof": {
      const claim = proofClaims.get(subject);
      const evidenceType = CLAIM_EVIDENCE_TYPES[claim?.type]?.[0] ?? "gap_record";
      const obligation = {
        ...base,
        claim_id: subject,
        method: evidenceType === "gap_record" ? "gap_closure" : "proof_refresh",
        evidence_type: evidenceType,
        validation_method: evidenceType === "gap_record" ? "gap_acceptance" : "proof_refresh",
        status: claim?.gap_refs?.length > 0 ? "gapped" : "open",
        action: `Refresh proof claim ${subject} with current evidence or keep an explicit gap.`
      };
      if (claim?.gap_refs?.[0]) {
        obligation.gap_id = claim.gap_refs[0];
      }
      return obligation;
    }
    case "unknown":
      return {
        ...base,
        id: safeId("proof.unknown", affectedRecord.category ?? affectedRecord.id),
        method: "resolve_gap",
        evidence_type: "gap_record",
        validation_method: "gap_acceptance",
        status: "gapped",
        gap_id: safeId("gap.impact", affectedRecord.category ?? "target"),
        action: `Resolve or explicitly accept the ${affectedRecord.category ?? "unknown"} impact gap before launch.`
      };
    default:
      return undefined;
  }
}

function approvalForAffected(affectedRecord, sourceId) {
  if (!["gate", "risk", "unknown"].includes(affectedRecord.kind)) {
    return undefined;
  }

  const isUnknown = affectedRecord.kind === "unknown";
  const approver = affectedRecord.kind === "gate"
    ? "launch_owner"
    : affectedRecord.kind === "risk"
      ? "risk_owner"
      : "authority_owner";

  const approval = {
    id: safeId(`approval.${slugify(affectedRecord.kind)}`, affectedRecord.category ?? affectedRecord.id),
    summary: isUnknown
      ? `Approve or resolve ${affectedRecord.category ?? affectedRecord.id}.`
      : `Approve affected ${affectedRecord.kind} ${affectedRecord.ref ?? affectedRecord.id}.`,
    affected_kind: affectedRecord.kind,
    affected_id: affectedRecord.ref ?? affectedRecord.id,
    approver,
    action: isUnknown
      ? `Approve an explicit gap for ${affectedRecord.category ?? affectedRecord.id} or provide authoritative mapping.`
      : `Approve the affected ${affectedRecord.kind} ${affectedRecord.id} after proof obligations are satisfied or gapped.`,
    reason: affectedRecord.reason,
    source_refs: sourceRefsFor(affectedRecord, sourceId),
    authority_state: affectedRecord.authority_state ?? "repo_observed",
    approval_state: "pending",
    confidence: typeof affectedRecord.confidence === "number" ? affectedRecord.confidence : 0.7,
    status: "open"
  };
  if (isUnknown) {
    approval.gap_id = safeId("gap.impact", affectedRecord.category ?? "target");
  }
  return approval;
}

export function createImpactRecord({ map, proof = {}, change }) {
  if (!map) {
    throw new Error("Impact analysis requires a SEAL map artifact.");
  }
  if (!change?.target) {
    throw new Error("Impact analysis requires change.target.");
  }

  const sourceId = firstSourceId(map);
  const target = normalizePath(change.target);
  const summary = change.summary || `Assess impact of ${target}.`;
  const indexes = buildIndexes(map, proof);
  const ontologyGraph = buildOntologyGraph(map, proof);
  const maxDepth = Number.isInteger(change.max_depth) ? change.max_depth : 4;
  const seedIds = new Set();
  const affected = {
    requirements: [],
    components: [],
    files: [],
    interfaces: [],
    invariants: [],
    schemas: [],
    tests: []
  };
  const affectedFlat = [];
  const gaps = [];
  const affectedKeys = new Set();

  function addAffected(kind, id, reason, record, extra = {}) {
    const key = `${kind}:${id}`;
    if (affectedKeys.has(key)) {
      return;
    }
    affectedKeys.add(key);
    const ref = extra.ref ?? id;
    const affectedRecord = {
      kind,
      id: safeId(kind, id),
      ref,
      summary: extra.summary ?? `${kind} ${ref ?? id}`,
      reason,
      ...authorityFrom(record, sourceId),
      ...extra
    };
    affectedFlat.push(affectedRecord);
    switch (kind) {
      case "requirement":
        affected.requirements.push(affectedRecord);
        break;
      case "component":
        affected.components.push(affectedRecord);
        break;
      case "file":
        affected.files.push(affectedRecord);
        break;
      case "test":
        affected.tests.push(affectedRecord);
        break;
      case "schema":
        affected.schemas.push(affectedRecord);
        break;
      case "interface":
        affected.interfaces.push(affectedRecord);
        break;
      case "invariant":
        affected.invariants.push(affectedRecord);
        break;
      default:
        break;
    }
  }

  const directFile = indexes.files.get(target);
  if (directFile) {
    const ownerComponentId = directFile.owner_component_id ?? directFile.component_id;
    seedIds.add(directFile.path);
    seedIds.add(ownerComponentId);
    addAffected(classifyFileImpact(directFile), directFile.path, `Changed file ${directFile.path} is in scope.`, directFile, { ref: directFile.path });
  }

  for (const [id, entry] of indexes.byId) {
    if (id === target) {
      seedIds.add(id);
      addAffected(entry.kind, id, `Changed ${entry.kind} ${id} is in scope.`, entry.record);
    }
  }

  if (seedIds.size === 0) {
    addAffected("unknown", `unknown.${slugify(target)}`, `No mapped artifact directly matches ${target}.`, { source_refs: [sourceId] }, {
      category: "unmapped_target",
      target,
      ref: target
    });
    addGap(gaps, `target.${slugify(target)}`, sourceId, `No MAP record matched ${target}.`, "The proposed change target is not covered by a mapped file, component, requirement, risk, proof claim, or launch gate.");
  }

  for (const unsupported of ontologyGraph.unsupported) {
    addGap(
      gaps,
      `relationship.${slugify(unsupported.type ?? "unknown")}`,
      sourceId,
      `Unsupported impact relationship type ${unsupported.type ?? "unknown"}.`,
      "Impact traversal skipped a relationship whose type is not defined by the SEAL ontology."
    );
  }

  const tracedIds = collectGraphIds(ontologyGraph.graph, seedIds, maxDepth);
  for (const id of tracedIds) {
    const entry = indexes.byId.get(id);
    if (entry) {
      addAffected(entry.kind, id, `Trace links connect ${id} to the proposed change.`, entry.record);
    }
  }

  const componentIds = new Set(
    affectedFlat
      .filter((record) => record.kind === "component")
      .map((record) => record.ref ?? record.id.replace(/^component\./, ""))
  );
  const directOwnerComponentId = directFile?.owner_component_id ?? directFile?.component_id;
  if (directOwnerComponentId) {
    componentIds.add(directOwnerComponentId);
  }

  for (const file of indexes.files.values()) {
    const ownerComponentId = file.owner_component_id ?? file.component_id;
    if (ownerComponentId && componentIds.has(ownerComponentId)) {
      addAffected(classifyFileImpact(file), file.path, `File belongs to affected component ${ownerComponentId}.`, file, { ref: file.path });
    }
  }

  const affectedSourceRefs = new Set(affectedFlat.flatMap((record) => record.source_refs ?? []));
  for (const [claimId, claim] of indexes.claims) {
    if (tracedIds.has(claimId)) {
      addAffected("proof", claimId, "Ontology relationships connect this proof claim to the proposed change.", claim);
    } else if (change.include_source_overlap !== false && hasSourceOverlap(claim, affectedSourceRefs)) {
      addAffected("proof", claimId, "Proof claim shares source authority with the affected scope.", claim);
    }
  }

  const proofNeeded = [...indexes.claims]
    .filter(([claimId]) => affectedFlat.some((record) => record.kind === "proof" && (record.ref ?? record.id) === claimId))
    .map(([claimId, claim]) => ({
      id: safeId("proof.need", claimId),
      summary: `Refresh proof claim ${claimId}.`,
      claim_id: claimId,
      reason: "Affected scope requires this proof claim to be refreshed or rechecked.",
      ...authorityFrom(claim, sourceId)
    }));

  for (const domain of unknownDomains) {
    addAffected("unknown", `unknown.${domain}.${slugify(target)}`, `No authoritative ${domain} mapping was available for this impact scope.`, { source_refs: [sourceId] }, {
      category: domain
    });
    addGap(gaps, domain, sourceId, `Impact scope lacks ${domain} evidence.`, `SEAL cannot confirm affected ${domain} records until the MAP model includes that artifact type or trace evidence.`);
  }

  if (affected.tests.length === 0) {
    addGap(gaps, "test", sourceId, "No affected test file was identified.", "The MAP did not connect this change to a test file.");
  }

  if (proofNeeded.length === 0) {
    addGap(gaps, "proof", sourceId, "No proof claim was linked to the affected scope.", "Impact analysis could not find a PROVE claim sharing trace or source authority with the changed target.");
  }

  const proofRequired = affectedFlat
    .map((affectedRecord) => proofObligationForAffected(affectedRecord, indexes.claims, sourceId))
    .filter(Boolean);
  const approvalNeeded = affectedFlat
    .map((affectedRecord) => approvalForAffected(affectedRecord, sourceId))
    .filter(Boolean);

  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    id: `IMPACT-${slugify(change.id ?? summary ?? target)}`,
    change: {
      summary,
      target,
      source_refs: sourceRefsFor(change, sourceId),
      authority_state: change.authority_state ?? "repo_observed",
      approval_state: change.approval_state ?? "pending",
      confidence: typeof change.confidence === "number" ? change.confidence : 0.7
    },
    affected,
    affected_flat: affectedFlat,
    dependency_service_cost_impact: {
      dependencies_changed: false,
      services_changed: false,
      cost_changed: false,
      new_runtime_costs: [],
      removed_runtime_costs: [],
      unknown_costs: gaps
        .filter((gap) => gap.id === safeId("gap.impact", "cost"))
        .map((gap) => ({
          id: safeId("cost.unknown", target),
          summary: "Runtime cost impact is unknown.",
          gap_id: gap.id,
          source_refs: [sourceId],
          authority_state: "repo_observed",
          approval_state: "pending",
          confidence: 0.7
        })),
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.7
    },
    proof_needed: proofNeeded,
    proof_required: proofRequired,
    approval_needed: approvalNeeded,
    blocking_unknowns: gaps.filter((gap) => gap.status !== "closed"),
    gaps
  };
}

export async function writeImpactRecord(rootPath, change) {
  const root = path.resolve(rootPath);
  const map = await parseYamlArtifact(path.join(root, ".seal", "map.yaml"));
  let proof = {};
  try {
    proof = await parseYamlArtifact(path.join(root, ".seal", "proof.yaml"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const impact = createImpactRecord({ map, proof, change });
  const outputPath = path.join(root, ".seal", "impacts", `${impact.id}.yaml`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stringifyArtifact(impact), "utf8");
  return { impact, outputPath };
}
