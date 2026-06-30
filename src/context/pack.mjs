import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseYamlArtifact } from "../artifacts/schema-registry.mjs";
import { stringifyArtifact } from "../artifacts/generate.mjs";
import { CONTRACT_SCHEMA_VERSION, CONTEXT_PACK_BUDGET, GENERATED_VIEW_NOTICE } from "../contracts/constants.mjs";
import { createImpactRecord } from "../impact/change-scope.mjs";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

function recordId(record) {
  return record?.ref ?? record?.path ?? record?.id;
}

function authorityFor(record) {
  return {
    source_refs: asList(record?.source_refs),
    authority_state: record?.authority_state ?? "unknown",
    approval_state: record?.approval_state ?? "not_required",
    confidence: typeof record?.confidence === "number" ? record.confidence : undefined,
  };
}

function compactRecord(record, keys) {
  const output = {};
  for (const key of keys) {
    if (record?.[key] !== undefined) {
      output[key] = record[key];
    }
  }
  return {
    ...output,
    ...authorityFor(record),
  };
}

function proofStatusForClaim(record) {
  if (record?.status) {
    return record.status;
  }
  if (asList(record?.counterevidence_refs).length > 0) {
    return "contested";
  }
  if (asList(record?.gap_refs).length > 0) {
    return "gapped";
  }
  if (asList(record?.evidence_refs).length > 0) {
    return "proven";
  }
  return "unknown";
}

function countByKind(records) {
  const counts = {};
  for (const record of asList(records)) {
    const key = `${record?.kind ?? "records"}s`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function byId(records, key = "id") {
  return new Map(asList(records).filter((record) => record?.[key]).map((record) => [normalizePath(record[key]), record]));
}

function addRecord(target, record, reason, kind) {
  const id = recordId(record);
  if (!id) {
    return;
  }
  target.set(`${kind}:${id}`, {
    id,
    kind,
    reason,
    source_refs: asList(record?.source_refs),
  });
}

function addAll(target, values) {
  for (const value of asList(values)) {
    if (value) {
      target.add(normalizePath(value));
    }
  }
}

function sortedRecords(records, key = "id") {
  return [...records].sort((left, right) => String(left[key] ?? left.path ?? "").localeCompare(String(right[key] ?? right.path ?? "")));
}

function ownerComponentId(file) {
  return file?.owner_component_id ?? file?.component_id;
}

function mapComponents(map) {
  return asList(map?.components).length > 0 ? asList(map.components) : asList(map?.observed?.components);
}

function mapFiles(map) {
  return asList(map?.files).length > 0 ? asList(map.files) : asList(map?.observed?.files);
}

function mapGaps(map) {
  const records = [...asList(map?.unknowns), ...asList(map?.gaps)];
  return [...new Map(records.filter((record) => record?.id).map((record) => [record.id, record])).values()];
}

function flattenAffected(impact) {
  const affected = impact?.affected;
  if (Array.isArray(affected)) {
    return affected;
  }
  const typed = affected && typeof affected === "object"
    ? [
      ...asList(affected.requirements),
      ...asList(affected.components),
      ...asList(affected.files),
      ...asList(affected.interfaces),
      ...asList(affected.invariants),
      ...asList(affected.schemas),
      ...asList(affected.tests),
    ]
    : [];
  const all = [...typed, ...asList(impact?.affected_flat)];
  return [...new Map(all.filter(Boolean).map((record) => [`${record.kind ?? "record"}:${recordId(record)}`, record])).values()];
}

function selectedImpacts({ map, proof, impacts, change }) {
  const supplied = asList(impacts);
  if (change?.impact_id) {
    const matched = supplied.filter((impact) => impact.id === change.impact_id);
    if (matched.length > 0) {
      return matched;
    }
  }

  const target = change?.target ? normalizePath(change.target) : undefined;
  if (target) {
    const matched = supplied.filter((impact) =>
      normalizePath(impact.change?.target) === target ||
      flattenAffected(impact).some((record) => normalizePath(recordId(record)) === target)
    );
    if (matched.length > 0) {
      return matched;
    }
    return [createImpactRecord({ map, proof, change })];
  }

  if (supplied.length > 0) {
    return [supplied[0]];
  }

  throw new Error("Context pack requires a change target or at least one impact record.");
}

function interfaceRecords(components, files, map) {
  const records = [];
  for (const item of asList(map?.interfaces)) {
    records.push({ ...item, owner_kind: "map", ...authorityFor(item) });
  }
  for (const component of components) {
    for (const item of asList(component.interfaces)) {
      const record = typeof item === "object"
        ? item
        : { id: `${component.id}.${item}`, name: item, owner_id: component.id };
      records.push({
        ...record,
        owner_id: record.owner_id ?? component.id,
        owner_kind: "component",
        ...authorityFor(record.source_refs ? record : component),
      });
    }
  }
  for (const file of files) {
    for (const item of asList(file.interfaces_touched)) {
      const record = typeof item === "object"
        ? item
        : { id: `${file.path}.${item}`, name: item, owner_id: file.path };
      records.push({
        ...record,
        owner_id: record.owner_id ?? file.path,
        owner_kind: "file",
        ...authorityFor(record.source_refs ? record : file),
      });
    }
  }
  return sortedRecords(new Map(records.map((record) => [record.id ?? `${record.owner_id}.${record.name}`, record])).values());
}

function dependencyRecords(components, files, map) {
  const records = [];
  for (const dependency of asList(map?.dependencies)) {
    records.push(dependency);
  }
  for (const component of components) {
    for (const dependency of asList(component.dependencies)) {
      records.push({
        owner_kind: "component",
        owner_id: component.id,
        ...dependency,
        ...authorityFor(dependency.source_refs ? dependency : component),
      });
    }
  }
  for (const file of files) {
    for (const dependency of asList(file.dependencies)) {
      records.push({
        owner_kind: "file",
        owner_id: file.path,
        owner_component_id: ownerComponentId(file),
        ...dependency,
        ...authorityFor(dependency.source_refs ? dependency : file),
      });
    }
  }
  return sortedRecords(records, "id");
}

function evidenceByClaim(evidenceIndex) {
  const index = new Map();
  for (const evidence of asList(evidenceIndex?.evidence)) {
    for (const claimId of [...asList(evidence.claim_ids), ...asList(evidence.supports)]) {
      if (!index.has(claimId)) {
        index.set(claimId, []);
      }
      index.get(claimId).push(evidence);
    }
  }
  return index;
}

function includeRelevantRecords({ map, proof, evidenceIndex, selected }) {
  const included = new Map();
  const componentIds = new Set();
  const filePaths = new Set();
  const claimIds = new Set();
  const gapIds = new Set();
  const evidenceIds = new Set();

  const components = mapComponents(map);
  const files = mapFiles(map);
  const gaps = mapGaps(map);
  const componentsById = byId(components);
  const filesByPath = byId(files, "path");
  const claimsById = byId(proof?.claims);
  const proofGapsById = byId(proof?.gaps);
  const mapGapsById = byId(gaps);
  const evidenceById = byId(evidenceIndex?.evidence);
  const evidenceClaimIndex = evidenceByClaim(evidenceIndex);

  for (const impact of selected) {
    addRecord(included, impact, "selected_impact", "impact");
    for (const affected of flattenAffected(impact)) {
      const affectedId = normalizePath(recordId(affected));
      if (!affectedId) {
        continue;
      }
      if (affected.kind === "component") {
        componentIds.add(affectedId);
      }
      if (["file", "test", "schema"].includes(affected.kind)) {
        filePaths.add(affectedId);
        const file = filesByPath.get(affectedId);
        if (ownerComponentId(file)) {
          componentIds.add(ownerComponentId(file));
        }
      }
      if (affected.kind === "proof") {
        claimIds.add(affectedId);
      }
      if (affected.kind === "gap" || affected.kind === "unknown") {
        gapIds.add(affectedId);
      }
    }

    for (const proofNeed of [...asList(impact.proof_needed), ...asList(impact.proof_required)]) {
      if (proofNeed.claim_id) {
        claimIds.add(proofNeed.claim_id);
      }
      if (proofNeed.gap_id) {
        gapIds.add(proofNeed.gap_id);
      }
    }

    for (const gap of [...asList(impact.gaps), ...asList(impact.blocking_unknowns)]) {
      if (gap.id) {
        gapIds.add(gap.id);
      }
    }
  }

  for (const file of files) {
    if (componentIds.has(ownerComponentId(file))) {
      filePaths.add(normalizePath(file.path));
      addAll(gapIds, file.gap_refs);
      addAll(gapIds, file.unknowns);
    }
  }

  for (const componentId of [...componentIds]) {
    const component = componentsById.get(componentId);
    addAll(filePaths, component?.files ?? component?.source_files);
    addAll(filePaths, component?.tests);
    addAll(gapIds, component?.gap_refs ?? component?.gaps);
    addAll(gapIds, component?.proof_gaps);
    addAll(gapIds, component?.unknowns);
  }

  for (const claimId of [...claimIds]) {
    const claim = claimsById.get(claimId);
    addAll(evidenceIds, claim?.evidence_refs);
    addAll(gapIds, claim?.gap_refs);
    for (const evidence of asList(evidenceClaimIndex.get(claimId))) {
      evidenceIds.add(evidence.id);
    }
  }

  const selectedComponents = sortedRecords([...componentIds].map((id) => componentsById.get(id)).filter(Boolean)).slice(0, CONTEXT_PACK_BUDGET.max_records.components);
  const selectedFiles = sortedRecords([...filePaths].map((filePath) => filesByPath.get(filePath)).filter(Boolean), "path").slice(0, CONTEXT_PACK_BUDGET.max_records.files);
  const selectedClaims = sortedRecords([...claimIds].map((id) => claimsById.get(id)).filter(Boolean)).slice(0, CONTEXT_PACK_BUDGET.max_records.proof_claims);
  const selectedEvidence = sortedRecords([...evidenceIds].map((id) => evidenceById.get(id)).filter(Boolean));
  const selectedGaps = sortedRecords([...gapIds].map((id) => proofGapsById.get(id) ?? mapGapsById.get(id)).filter(Boolean)).slice(0, CONTEXT_PACK_BUDGET.max_records.gaps);

  for (const record of selectedComponents) {
    addRecord(included, record, "affected_component_or_owner", "component");
  }
  for (const record of selectedFiles) {
    addRecord(included, record, "directly_targeted_or_component_owned", "file");
  }
  for (const record of selectedClaims) {
    addRecord(included, record, "required_proof_claim", "proof_claim");
  }
  for (const record of selectedGaps) {
    addRecord(included, record, "blocks_required_proof_or_mapping", "gap");
  }

  const excluded = [];
  for (const component of components) {
    if (!selectedComponents.some((record) => record.id === component.id)) {
      excluded.push({ id: component.id, kind: "component", reason: "no_trace_or_dependency_path_to_target", source_refs: asList(component.source_refs) });
    }
  }
  for (const file of files) {
    if (!selectedFiles.some((record) => record.path === file.path)) {
      excluded.push({ id: file.path, kind: "file", reason: "outside_budget_or_unrelated_to_target", source_refs: asList(file.source_refs) });
    }
  }

  return {
    included: [...included.values()],
    excluded,
    selectedComponents,
    selectedFiles,
    selectedClaims,
    selectedEvidence,
    selectedGaps,
  };
}

export function createContextPack({ map, proof = {}, evidenceIndex = {}, impacts = [], change = {} } = {}) {
  if (!map) {
    throw new Error("Context pack requires a SEAL map artifact.");
  }

  const selected = selectedImpacts({ map, proof, impacts, change });
  const {
    included,
    excluded,
    selectedComponents,
    selectedFiles,
    selectedClaims,
    selectedEvidence,
    selectedGaps,
  } = includeRelevantRecords({ map, proof, evidenceIndex, selected });
  const target = normalizePath(change.target ?? selected[0]?.change?.target ?? selected[0]?.id ?? "impact");
  const slices = {
    components: selectedComponents.map((record) => compactRecord(record, ["id", "name", "purpose", "files", "source_files", "dependencies", "interfaces", "tests", "proof_gaps", "unknowns"])),
    files: selectedFiles.map((record) => compactRecord(record, ["path", "classification", "owner_component_id", "component_id", "purpose", "role", "entrypoint", "interfaces_touched", "tests", "proof_status", "content_hash", "mapped_at"])),
    interfaces: interfaceRecords(selectedComponents, selectedFiles, map),
    dependencies: dependencyRecords(selectedComponents, selectedFiles, map),
    tests: selectedFiles
      .filter((record) => record.classification === "test" || normalizePath(record.path).includes("/test"))
      .map((record) => compactRecord(record, ["path", "owner_component_id", "component_id", "purpose", "proof_status"])),
    impacts: selected.map((record) => compactRecord(record, ["id", "change", "affected", "affected_flat", "dependency_service_cost_impact", "proof_needed", "proof_required", "approval_needed", "blocking_unknowns", "gaps"])),
    proof_claims: selectedClaims.map((record) => compactRecord(record, ["id", "subject", "type", "statement", "status", "evidence_refs", "gap_refs", "counterevidence_refs", "limitations", "freshness", "confidence"])),
    evidence: selectedEvidence.map((record) => compactRecord(record, ["id", "type", "method", "status", "captured_at", "source", "artifact_path", "hash", "limitations", "supports", "refutes"])),
    gaps: selectedGaps.map((record) => compactRecord(record, ["id", "summary", "missing", "reason", "closure_method", "blocks", "severity", "status", "next_step"])),
  };
  const scope = {
    components: slices.components,
    files: slices.files,
    interfaces: slices.interfaces,
    dependencies: slices.dependencies,
    tests: slices.tests,
    impacts: slices.impacts,
    claims: slices.proof_claims.map((record) => ({
      ...record,
      proof_status: proofStatusForClaim(record),
    })),
    evidence: slices.evidence,
    gaps: slices.gaps,
  };
  const pack = {
    schema_version: CONTRACT_SCHEMA_VERSION,
    generated_from: ".seal/*.yaml",
    notice: GENERATED_VIEW_NOTICE,
    target,
    budget: CONTEXT_PACK_BUDGET,
    included,
    excluded,
    slices,
    scope,
    omitted_counts: countByKind(excluded),
    guardrails: [
      "This pack is generated from .seal artifacts and is non-authoritative.",
      "Treat inferred or unknown records as gaps until linked to approved authority.",
      `Context packs must stay within ${CONTEXT_PACK_BUDGET.max_bytes} bytes and exclude full artifact dumps.`,
    ],
    source_refs: [...new Set(included.flatMap((record) => asList(record.source_refs)))],
  };
  pack.actual_bytes = Buffer.byteLength(JSON.stringify(pack), "utf8");
  pack.truncated = pack.actual_bytes > CONTEXT_PACK_BUDGET.max_bytes;
  return pack;
}

async function readOptionalArtifact(filePath) {
  try {
    return await parseYamlArtifact(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function readImpactArtifacts(root) {
  const impactDir = path.join(root, ".seal", "impacts");
  try {
    const entries = await readdir(impactDir, { withFileTypes: true });
    const impacts = [];
    for (const entry of entries.filter((item) => item.isFile() && /^IMPACT-.+\.ya?ml$/.test(item.name)).sort((left, right) => left.name.localeCompare(right.name))) {
      impacts.push(await parseYamlArtifact(path.join(impactDir, entry.name)));
    }
    return impacts;
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function writeContextPack(rootPath, change) {
  const root = path.resolve(rootPath);
  const [map, proof, evidenceIndex, impacts] = await Promise.all([
    readOptionalArtifact(path.join(root, ".seal", "map.yaml")),
    readOptionalArtifact(path.join(root, ".seal", "proof.yaml")),
    readOptionalArtifact(path.join(root, ".seal", "evidence", "index.yaml")),
    readImpactArtifacts(root),
  ]);
  const pack = createContextPack({ map, proof, evidenceIndex, impacts, change });
  const outputPath = path.join(root, ".seal", "context-pack.yaml");
  const reportPath = path.join(root, ".seal", "reports", "context-pack.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(outputPath, stringifyArtifact(pack), "utf8");
  await writeFile(reportPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
  return { pack, outputPath, reportPath };
}
