import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseYamlArtifact } from "../artifacts/schema-registry.mjs";
import { createImpactRecord } from "../impact/change-scope.mjs";
import { createProofGapReport } from "../proof/gap-report.mjs";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/");
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

function byId(records, key = "id") {
  return new Map(asList(records).filter((record) => record?.[key]).map((record) => [record[key], record]));
}

function addAll(target, values) {
  for (const value of asList(values)) {
    if (value) {
      target.add(value);
    }
  }
}

function sortedRecords(records, key = "id") {
  return [...records].sort((left, right) => String(left[key] ?? "").localeCompare(String(right[key] ?? "")));
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
      asList(impact.affected).some((record) => normalizePath(record.id) === target)
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

function interfaceRecords(components, files) {
  const records = [];
  for (const component of components) {
    for (const name of asList(component.interfaces)) {
      records.push({
        id: `${component.id}.${name}`,
        name,
        owner_id: component.id,
        owner_kind: "component",
        ...authorityFor(component),
      });
    }
  }
  for (const file of files) {
    for (const name of asList(file.interfaces_touched)) {
      records.push({
        id: `${file.path}.${name}`,
        name,
        owner_id: file.path,
        owner_kind: "file",
        ...authorityFor(file),
      });
    }
  }
  return sortedRecords(new Map(records.map((record) => [record.id, record])).values());
}

function evidenceByClaim(evidenceIndex) {
  const index = new Map();
  for (const evidence of asList(evidenceIndex?.evidence)) {
    for (const claimId of asList(evidence.claim_ids)) {
      if (!index.has(claimId)) {
        index.set(claimId, []);
      }
      index.get(claimId).push(evidence);
    }
  }
  return index;
}

function unknownFromImpact(record, impact) {
  return {
    id: `unknown.${impact.id}.${record.category ?? record.id}`,
    kind: record.category ?? "impact_unknown",
    summary: record.reason ?? `${record.id} is unknown for ${impact.id}.`,
    status: "open",
    source_refs: asList(record.source_refs),
    authority_state: record.authority_state ?? "unknown",
    approval_state: record.approval_state ?? "pending",
    confidence: typeof record.confidence === "number" ? record.confidence : 0.5,
    artifact_refs: [{ artifact: "impact", ref: impact.id }],
  };
}

export function createContextPack({ map, proof = {}, evidenceIndex = {}, impacts = [], change = {} } = {}) {
  if (!map) {
    throw new Error("Context pack requires a SEAL map artifact.");
  }

  const selected = selectedImpacts({ map, proof, impacts, change });
  const componentIds = new Set();
  const filePaths = new Set();
  const claimIds = new Set();
  const gapIds = new Set();
  const evidenceIds = new Set();

  const componentsById = byId(map.components);
  const filesByPath = byId(map.files, "path");
  const claimsById = byId(proof.claims);
  const proofGapsById = byId(proof.gaps);
  const mapGapsById = byId(map.gaps);
  const evidenceById = byId(evidenceIndex.evidence);
  const evidenceClaimIndex = evidenceByClaim(evidenceIndex);

  for (const impact of selected) {
    for (const affected of asList(impact.affected)) {
      if (affected.kind === "component") {
        componentIds.add(affected.id);
      }
      if (["file", "test", "schema"].includes(affected.kind)) {
        filePaths.add(normalizePath(affected.id));
        const file = filesByPath.get(normalizePath(affected.id));
        if (file?.component_id) {
          componentIds.add(file.component_id);
        }
      }
      if (affected.kind === "proof") {
        claimIds.add(affected.id);
      }
      if (affected.kind === "gap") {
        gapIds.add(affected.id);
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

    for (const gap of asList(impact.gaps)) {
      if (gap.id) {
        gapIds.add(gap.id);
      }
    }
  }

  for (const file of asList(map.files)) {
    if (componentIds.has(file.component_id)) {
      filePaths.add(normalizePath(file.path));
      addAll(gapIds, file.gap_refs);
    }
  }

  for (const componentId of componentIds) {
    const component = componentsById.get(componentId);
    addAll(filePaths, component?.source_files?.map(normalizePath));
    addAll(filePaths, component?.tests?.map(normalizePath));
    addAll(gapIds, component?.gap_refs);
  }

  for (const claimId of [...claimIds]) {
    const claim = claimsById.get(claimId);
    addAll(evidenceIds, claim?.evidence_refs);
    addAll(gapIds, claim?.gap_refs);
    for (const evidence of asList(evidenceClaimIndex.get(claimId))) {
      evidenceIds.add(evidence.id);
    }
  }

  const selectedComponents = sortedRecords([...componentIds].map((id) => componentsById.get(id)).filter(Boolean));
  const selectedFiles = sortedRecords([...filePaths].map((filePath) => filesByPath.get(filePath)).filter(Boolean), "path");
  const selectedClaims = sortedRecords([...claimIds].map((id) => claimsById.get(id)).filter(Boolean));
  const selectedEvidence = sortedRecords([...evidenceIds].map((id) => evidenceById.get(id)).filter(Boolean));
  const selectedGaps = sortedRecords([...gapIds].map((id) => proofGapsById.get(id) ?? mapGapsById.get(id)).filter(Boolean));
  const proofReport = createProofGapReport({ proof, evidenceIndex });
  const proofStatusById = new Map(asList(proofReport.claims).map((record) => [record.claim.id, record]));
  const unknowns = selected.flatMap((impact) =>
    asList(impact.affected)
      .filter((record) => record.kind === "unknown")
      .map((record) => unknownFromImpact(record, impact))
  );

  return {
    schema_version: "0.1.0",
    id: `context.${normalizePath(change.target ?? selected[0]?.id ?? "impact").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}`,
    change: {
      target: change.target,
      summary: change.summary,
      impact_ids: selected.map((impact) => impact.id),
    },
    scope: {
      components: selectedComponents.map((record) => compactRecord(record, ["id", "name", "purpose", "interfaces", "source_files", "tests"])),
      files: selectedFiles.map((record) => compactRecord(record, ["path", "classification", "component_id", "purpose", "role", "entrypoint", "interfaces_touched", "tests", "proof_status"])),
      interfaces: interfaceRecords(selectedComponents, selectedFiles),
      tests: selectedFiles
        .filter((record) => record.classification === "test" || normalizePath(record.path).includes("/test"))
        .map((record) => compactRecord(record, ["path", "component_id", "purpose", "proof_status"])),
      impacts: selected.map((record) => compactRecord(record, ["id", "change", "affected", "proof_needed", "proof_required", "approval_needed", "gaps"])),
      claims: selectedClaims.map((record) => ({
        ...compactRecord(record, ["id", "type", "statement", "evidence_refs", "gap_refs"]),
        proof_status: proofStatusById.get(record.id)?.status ?? "unknown",
        proof_reasons: proofStatusById.get(record.id)?.reasons ?? [],
      })),
      evidence: selectedEvidence.map((record) => compactRecord(record, ["id", "type", "claim_ids", "status", "captured_at", "source", "limitations", "redaction"])),
      gaps: selectedGaps.map((record) => compactRecord(record, ["id", "summary", "reason", "status", "next_step"])),
      unknowns,
    },
    omitted_counts: {
      components: Math.max(0, asList(map.components).length - selectedComponents.length),
      files: Math.max(0, asList(map.files).length - selectedFiles.length),
      claims: Math.max(0, asList(proof.claims).length - selectedClaims.length),
      evidence: Math.max(0, asList(evidenceIndex.evidence).length - selectedEvidence.length),
      gaps: Math.max(0, asList(map.gaps).length + asList(proof.gaps).length - selectedGaps.length),
    },
    guardrails: [
      "Use inferred or unknown records only as prompts for inspection, not as approved baseline truth.",
      "Treat proof as claim plus evidence plus visible gap; do not convert missing evidence into a passing checklist.",
    ],
  };
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
  const outputPath = path.join(root, ".seal", "reports", "context-pack.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
  return { pack, outputPath };
}
