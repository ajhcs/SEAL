import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringifyArtifact } from "../artifacts/generate.mjs";
import { parseYamlArtifact } from "../artifacts/schema-registry.mjs";
import { CLAIM_EVIDENCE_TYPES } from "../proof/taxonomy.mjs";

const schemaVersion = "0.1.0";
const unknownDomains = Object.freeze(["interface", "invariant", "service", "dependency", "cost"]);

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
  const requirements = new Map((map.requirements ?? []).map((requirement) => [requirement.id, requirement]));
  const risks = new Map((map.risks ?? []).map((risk) => [risk.id, risk]));
  const gates = new Map((map.launch_gates ?? []).map((gate) => [gate.id, gate]));
  const claims = new Map((proof?.claims ?? []).map((claim) => [claim.id, claim]));
  const byId = new Map([
    ...[...components].map(([id, record]) => [id, { kind: "component", record }]),
    ...[...requirements].map(([id, record]) => [id, { kind: "requirement", record }]),
    ...[...risks].map(([id, record]) => [id, { kind: "risk", record }]),
    ...[...gates].map(([id, record]) => [id, { kind: "gate", record }]),
    ...[...claims].map(([id, record]) => [id, { kind: "proof", record }])
  ]);

  return { components, files, requirements, risks, gates, claims, byId };
}

function traceNeighbors(map, id) {
  const neighbors = [];
  for (const link of map.trace_links ?? []) {
    if (link.from_id === id) {
      neighbors.push(link.to_id);
    }
    if (link.to_id === id) {
      neighbors.push(link.from_id);
    }
  }
  return neighbors;
}

function collectTraceIds(map, seedIds) {
  const seen = new Set();
  const queue = [...seedIds].filter(Boolean);

  while (queue.length > 0) {
    const id = queue.shift();
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    for (const neighbor of traceNeighbors(map, id)) {
      if (!seen.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return seen;
}

function hasSourceOverlap(record, sourceRefs) {
  return sourceRefsFor(record, "").some((sourceRef) => sourceRefs.has(sourceRef));
}

function addGap(gaps, domain, sourceId, summary, reason) {
  const id = `gap.impact.${domain}`;
  if (gaps.some((gap) => gap.id === id)) {
    return;
  }
  gaps.push({
    id,
    summary,
    reason,
    source_refs: [sourceId],
    authority_state: "repo_observed",
    approval_state: "not_required",
    confidence: 0.8,
    status: "open"
  });
}

function proofObligationForAffected(affectedRecord, proofClaims, sourceId) {
  const base = {
    id: `proof.${slugify(affectedRecord.kind)}.${slugify(affectedRecord.id)}`,
    affected_kind: affectedRecord.kind,
    affected_id: affectedRecord.id,
    reason: affectedRecord.reason,
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
        evidence_type: "test_result",
        validation_method: "command",
        action: `Run the affected test file ${affectedRecord.id} and attach the command output.`
      };
    case "file":
      return {
        ...base,
        evidence_type: "static_inspection",
        validation_method: "static_review",
        action: `Review changed implementation file ${affectedRecord.id} and link it to a claim or gap.`
      };
    case "schema":
      return {
        ...base,
        evidence_type: "static_inspection",
        validation_method: "static_review",
        action: `Validate schema or contract file ${affectedRecord.id} and record compatibility evidence.`
      };
    case "requirement":
      return {
        ...base,
        evidence_type: "human_approval",
        validation_method: "manual_validation",
        action: `Confirm requirement ${affectedRecord.id} still holds after the proposed change.`
      };
    case "risk":
      return {
        ...base,
        evidence_type: "human_approval",
        validation_method: "human_approval",
        action: `Review risk ${affectedRecord.id} and approve, reject, or gap the mitigation evidence.`
      };
    case "proof": {
      const claim = proofClaims.get(affectedRecord.id);
      const evidenceType = CLAIM_EVIDENCE_TYPES[claim?.type]?.[0] ?? "gap_record";
      const obligation = {
        ...base,
        claim_id: affectedRecord.id,
        evidence_type: evidenceType,
        validation_method: evidenceType === "gap_record" ? "gap_acceptance" : "proof_refresh",
        status: claim?.gap_refs?.length > 0 ? "gapped" : "open",
        action: `Refresh proof claim ${affectedRecord.id} with current evidence or keep an explicit gap.`
      };
      if (claim?.gap_refs?.[0]) {
        obligation.gap_id = claim.gap_refs[0];
      }
      return obligation;
    }
    case "unknown":
      return {
        ...base,
        id: `proof.unknown.${slugify(affectedRecord.category ?? affectedRecord.id)}`,
        evidence_type: "gap_record",
        validation_method: "gap_acceptance",
        status: "gapped",
        gap_id: `gap.impact.${affectedRecord.category ?? "target"}`,
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
    id: `approval.${slugify(affectedRecord.kind)}.${slugify(affectedRecord.category ?? affectedRecord.id)}`,
    affected_kind: affectedRecord.kind,
    affected_id: affectedRecord.id,
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
    approval.gap_id = `gap.impact.${affectedRecord.category ?? "target"}`;
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
  const seedIds = new Set();
  const affected = [];
  const gaps = [];
  const affectedKeys = new Set();

  function addAffected(kind, id, reason, record, extra = {}) {
    const key = `${kind}:${id}`;
    if (affectedKeys.has(key)) {
      return;
    }
    affectedKeys.add(key);
    affected.push({
      kind,
      id,
      reason,
      ...authorityFrom(record, sourceId),
      ...extra
    });
  }

  const directFile = indexes.files.get(target);
  if (directFile) {
    seedIds.add(directFile.component_id);
    addAffected(classifyFileImpact(directFile), directFile.path, `Changed file ${directFile.path} is in scope.`, directFile);
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
      target
    });
    addGap(gaps, `target.${slugify(target)}`, sourceId, `No MAP record matched ${target}.`, "The proposed change target is not covered by a mapped file, component, requirement, risk, proof claim, or launch gate.");
  }

  const tracedIds = collectTraceIds(map, seedIds);
  for (const id of tracedIds) {
    const entry = indexes.byId.get(id);
    if (entry) {
      addAffected(entry.kind, id, `Trace links connect ${id} to the proposed change.`, entry.record);
    }
  }

  const componentIds = new Set(
    [...affected]
      .filter((record) => record.kind === "component")
      .map((record) => record.id)
  );
  if (directFile?.component_id) {
    componentIds.add(directFile.component_id);
  }

  for (const file of indexes.files.values()) {
    if (file.component_id && componentIds.has(file.component_id)) {
      addAffected(classifyFileImpact(file), file.path, `File belongs to affected component ${file.component_id}.`, file);
    }
  }

  const affectedSourceRefs = new Set(affected.flatMap((record) => record.source_refs ?? []));
  for (const [claimId, claim] of indexes.claims) {
    if (tracedIds.has(claimId) || hasSourceOverlap(claim, affectedSourceRefs)) {
      addAffected("proof", claimId, "Proof claim shares source authority with the affected scope.", claim);
    }
  }

  const proofNeeded = [...indexes.claims]
    .filter(([claimId]) => affected.some((record) => record.kind === "proof" && record.id === claimId))
    .map(([claimId, claim]) => ({
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

  if (!affected.some((record) => record.kind === "test")) {
    addGap(gaps, "test", sourceId, "No affected test file was identified.", "The MAP did not connect this change to a test file.");
  }

  if (proofNeeded.length === 0) {
    addGap(gaps, "proof", sourceId, "No proof claim was linked to the affected scope.", "Impact analysis could not find a PROVE claim sharing trace or source authority with the changed target.");
  }

  const proofRequired = affected
    .map((affectedRecord) => proofObligationForAffected(affectedRecord, indexes.claims, sourceId))
    .filter(Boolean);
  const approvalNeeded = affected
    .map((affectedRecord) => approvalForAffected(affectedRecord, sourceId))
    .filter(Boolean);

  return {
    schema_version: schemaVersion,
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
    proof_needed: proofNeeded,
    proof_required: proofRequired,
    approval_needed: approvalNeeded,
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
