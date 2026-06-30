import crypto from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { parseYamlArtifact } from "./schema-registry.mjs";
import { CONTRACT_SCHEMA_VERSION, GENERATED_VIEW_NOTICE } from "../contracts/constants.mjs";

export const ARTIFACT_INDEX_PATH = ".seal/index.yaml";
export const ARTIFACT_INDEX_SUMMARY_MAX = 280;

const GENERATED_AT = "1970-01-01T00:00:00.000Z";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function artifactCollection(values, single) {
  const listed = asList(values);
  return listed.length > 0 ? listed : single ? [single] : [];
}

function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

function normalizeId(value) {
  return normalizePath(value).trim();
}

function recordIdentity(record) {
  return record?.ref ?? record?.path ?? record?.id ?? record?.subject ?? record?.component_id ?? record?.owner_component_id;
}

function relationIdentity(value) {
  return value?.ref ?? value?.path ?? value?.id ?? value;
}

function sourceRefs(record, fallback = []) {
  return [...new Set([...asList(record?.source_refs), ...asList(fallback)].filter(Boolean).map(String))].sort();
}

function escapePointerSegment(segment) {
  return String(segment).replaceAll("~", "~0").replaceAll("/", "~1");
}

function joinPointer(base, ...segments) {
  const prefix = base === "/" ? "" : base;
  return `${prefix}/${segments.map(escapePointerSegment).join("/")}`;
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function hashRecord(record) {
  return crypto.createHash("sha256").update(stableStringify(record)).digest("hex");
}

function firstText(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function summaryFor(record, kind, id) {
  const text = firstText(record, ["summary", "plain_language", "purpose", "statement", "reason", "missing", "description", "name", "type"]);
  const summary = text ?? `${kind} ${id}`;
  return summary.length > ARTIFACT_INDEX_SUMMARY_MAX
    ? `${summary.slice(0, ARTIFACT_INDEX_SUMMARY_MAX - 3)}...`
    : summary;
}

function artifactPathFor(artifactType, artifact) {
  const paths = {
    sources: ".seal/sources.yaml",
    plan: ".seal/plan.yaml",
    map: ".seal/map.yaml",
    trace: ".seal/trace.yaml",
    proof: ".seal/proof.yaml",
    evidenceIndex: ".seal/evidence/index.yaml",
    debt: ".seal/debt.yaml",
    contextPack: ".seal/context-pack.yaml"
  };
  if (artifactType === "impact") {
    return `.seal/impacts/${artifact?.id ?? "IMPACT-generated"}.yaml`;
  }
  if (artifactType === "fly") {
    return `.seal/fly/${artifact?.id ?? "FLY-generated"}.yaml`;
  }
  return paths[artifactType] ?? `.seal/${artifactType}.yaml`;
}

function topLevelArtifacts(artifactSet) {
  return [
    ["sources", artifactSet.sources],
    ["plan", artifactSet.plan],
    ["map", artifactSet.map],
    ["trace", artifactSet.trace],
    ...artifactCollection(artifactSet.impacts, artifactSet.impact).map((artifact) => ["impact", artifact]),
    ["proof", artifactSet.proof],
    ["evidenceIndex", artifactSet.evidenceIndex],
    ["debt", artifactSet.debt],
    ...artifactCollection(artifactSet.flies, artifactSet.fly).map((artifact) => ["fly", artifact]),
    ["contextPack", artifactSet.contextPack]
  ].filter(([, artifact]) => artifact && typeof artifact === "object");
}

function addRecord(records, artifactType, artifact, kind, record, pointer, fallbackSourceRefs = [], options = {}) {
  if (!record || typeof record !== "object") {
    return;
  }
  const id = normalizeId(options.id ?? recordIdentity(record));
  if (!id) {
    return;
  }
  const artifactPath = artifactPathFor(artifactType, artifact);
  const hash = hashRecord(record);
  const pathValue = normalizeId(options.path ?? record.path ?? record.ref);
  const indexRecord = {
    key: `${artifactType}:${kind}:${id}:${pointer}`,
    id,
    kind,
    artifact_type: artifactType,
    artifact_path: artifactPath,
    json_pointer: pointer,
    summary: summaryFor(record, kind, id),
    source_refs: sourceRefs(record, fallbackSourceRefs),
    hash,
    byte_count: Buffer.byteLength(stableStringify(record), "utf8"),
    freshness: {
      status: "current",
      hash
    }
  };

  if (pathValue) {
    indexRecord.path = pathValue;
  }
  if (options.impactTargets?.length > 0) {
    indexRecord.impact_targets = [...new Set(options.impactTargets.map(normalizeId).filter(Boolean))].sort();
  }
  if (options.relationRefs?.length > 0) {
    indexRecord.relation_refs = [...new Set(options.relationRefs.map(normalizeId).filter(Boolean))].sort();
  }

  records.push(indexRecord);
}

function addRelation(relations, artifactType, artifact, relation, pointer, fallbackSourceRefs = []) {
  const from = normalizeId(relationIdentity(relation?.from));
  const to = normalizeId(relationIdentity(relation?.to));
  if (!from || !to) {
    return;
  }
  relations.push({
    id: normalizeId(relation.id ?? `${relation.type}:${from}->${to}`),
    type: normalizeId(relation.type ?? "related_to"),
    from,
    to,
    artifact_type: artifactType,
    artifact_path: artifactPathFor(artifactType, artifact),
    json_pointer: pointer,
    source_refs: sourceRefs(relation, fallbackSourceRefs)
  });
}

function flattenAffected(impact) {
  if (Array.isArray(impact?.affected)) {
    return impact.affected;
  }
  const affected = impact?.affected && typeof impact.affected === "object" ? impact.affected : {};
  return [
    ...asList(affected.requirements),
    ...asList(affected.components),
    ...asList(affected.files),
    ...asList(affected.interfaces),
    ...asList(affected.invariants),
    ...asList(affected.schemas),
    ...asList(affected.tests),
    ...asList(impact?.affected_flat)
  ];
}

function addArray(records, artifactType, artifact, kind, values, pointer, fallbackSourceRefs = [], optionsFor = () => ({})) {
  asList(values).forEach((record, index) => {
    addRecord(records, artifactType, artifact, kind, record, joinPointer(pointer, index), fallbackSourceRefs, optionsFor(record, index));
  });
}

function collectRecords(artifactSet) {
  const records = [];
  const relations = [];

  for (const [artifactType, artifact] of topLevelArtifacts(artifactSet)) {
    const fallbackSourceRefs = sourceRefs(artifact);
    const topId = artifact.id ?? artifactType;
    addRecord(records, artifactType, artifact, artifactType, { id: topId, summary: `${artifactType} artifact`, source_refs: fallbackSourceRefs }, "/", fallbackSourceRefs);

    if (artifactType === "sources") {
      addArray(records, artifactType, artifact, "source", artifact.sources, "/sources", fallbackSourceRefs);
    }

    if (artifactType === "plan") {
      for (const [kind, value, pointer] of [
        ["scope", artifact.scope, "/scope"],
        ["non_goal", artifact.non_goals, "/non_goals"],
        ["trade_priority", artifact.trade_priorities, "/trade_priorities"],
        ["scenario", artifact.scenarios, "/scenarios"],
        ["acceptance_criterion", artifact.acceptance_criteria, "/acceptance_criteria"],
        ["proof_obligation", artifact.proof_obligations, "/proof_obligations"],
        ["approval_need", artifact.approval_needs, "/approval_needs"],
        ["architecture_component", artifact.architecture_intent?.components, "/architecture_intent/components"],
        ["architecture_interface", artifact.architecture_intent?.interfaces, "/architecture_intent/interfaces"],
        ["architecture_boundary", artifact.architecture_intent?.boundaries, "/architecture_intent/boundaries"]
      ]) {
        addArray(records, artifactType, artifact, kind, value, pointer, fallbackSourceRefs);
      }
    }

    if (artifactType === "map") {
      addArray(records, artifactType, artifact, "source", artifact.sources, "/sources", fallbackSourceRefs);
      addArray(records, artifactType, artifact, "component", artifact.components, "/components", fallbackSourceRefs);
      addArray(records, artifactType, artifact, "file", artifact.files, "/files", fallbackSourceRefs);
      addArray(records, artifactType, artifact, "dependency", artifact.dependencies, "/dependencies", fallbackSourceRefs);
      addArray(records, artifactType, artifact, "service", artifact.services?.discovered, "/services/discovered", fallbackSourceRefs);
      addArray(records, artifactType, artifact, "interface", artifact.interfaces, "/interfaces", fallbackSourceRefs);
      addArray(records, artifactType, artifact, "data_store", artifact.data_stores, "/data_stores", fallbackSourceRefs);
      addArray(records, artifactType, artifact, "test", artifact.tests, "/tests", fallbackSourceRefs);
      addArray(records, artifactType, artifact, "gap", [...asList(artifact.unknowns), ...asList(artifact.gaps)], "/gaps", fallbackSourceRefs);
      addArray(records, artifactType, artifact, "drift", artifact.drift, "/drift", fallbackSourceRefs);
      asList(artifact.components).forEach((component, index) => {
        for (const filePath of [...asList(component.files), ...asList(component.source_files)]) {
          addRelation(relations, artifactType, artifact, {
            id: `map.component_file.${component.id}.${filePath}`,
            type: "owns_file",
            from: component.id,
            to: filePath,
            source_refs: component.source_refs
          }, joinPointer("/components", index), fallbackSourceRefs);
        }
      });
      asList(artifact.files).forEach((file, index) => {
        if (file.component_id ?? file.owner_component_id) {
          addRelation(relations, artifactType, artifact, {
            id: `map.file_component.${file.path}`,
            type: "owned_by",
            from: file.path,
            to: file.component_id ?? file.owner_component_id,
            source_refs: file.source_refs
          }, joinPointer("/files", index), fallbackSourceRefs);
        }
      });
    }

    if (artifactType === "trace") {
      asList(artifact.relations).forEach((relation, index) => {
        addRecord(records, artifactType, artifact, "trace_relation", relation, joinPointer("/relations", index), fallbackSourceRefs, {
          relationRefs: [relation.from, relation.to]
        });
        addRelation(relations, artifactType, artifact, relation, joinPointer("/relations", index), fallbackSourceRefs);
      });
    }

    if (artifactType === "impact") {
      const affected = flattenAffected(artifact);
      addArray(records, artifactType, artifact, "impact_target", affected, "/affected", fallbackSourceRefs, (record) => ({
        impactTargets: [record.ref ?? record.id],
        path: record.ref ?? record.id
      }));
      addArray(records, artifactType, artifact, "proof_requirement", [...asList(artifact.proof_required), ...asList(artifact.proof_needed)], "/proof_required", fallbackSourceRefs);
      addArray(records, artifactType, artifact, "approval_need", artifact.approval_needed, "/approval_needed", fallbackSourceRefs);
      addArray(records, artifactType, artifact, "gap", [...asList(artifact.blocking_unknowns), ...asList(artifact.gaps)], "/gaps", fallbackSourceRefs);
      for (const affectedRecord of affected) {
        addRelation(relations, artifactType, artifact, {
          id: `impact.affects.${artifact.id}.${affectedRecord.ref ?? affectedRecord.id}`,
          type: "affects",
          from: artifact.id,
          to: affectedRecord.ref ?? affectedRecord.id,
          source_refs: affectedRecord.source_refs
        }, "/affected", fallbackSourceRefs);
      }
      for (const proofNeed of [...asList(artifact.proof_required), ...asList(artifact.proof_needed)]) {
        if (proofNeed.claim_id) {
          addRelation(relations, artifactType, artifact, {
            id: `impact.requires_claim.${artifact.id}.${proofNeed.claim_id}`,
            type: "requires_claim",
            from: artifact.id,
            to: proofNeed.claim_id,
            source_refs: proofNeed.source_refs
          }, "/proof_required", fallbackSourceRefs);
        }
        if (proofNeed.gap_id) {
          addRelation(relations, artifactType, artifact, {
            id: `impact.requires_gap.${artifact.id}.${proofNeed.gap_id}`,
            type: "requires_gap",
            from: artifact.id,
            to: proofNeed.gap_id,
            source_refs: proofNeed.source_refs
          }, "/proof_required", fallbackSourceRefs);
        }
      }
    }

    if (artifactType === "proof") {
      addArray(records, artifactType, artifact, "proof_claim", artifact.claims, "/claims", fallbackSourceRefs);
      addArray(records, artifactType, artifact, "proof_evidence", artifact.evidence, "/evidence", fallbackSourceRefs);
      addArray(records, artifactType, artifact, "gap", artifact.gaps, "/gaps", fallbackSourceRefs);
      asList(artifact.claims).forEach((claim, index) => {
        for (const evidenceId of asList(claim.evidence_refs)) {
          addRelation(relations, artifactType, artifact, {
            id: `proof.claim_evidence.${claim.id}.${evidenceId}`,
            type: "supported_by",
            from: claim.id,
            to: evidenceId,
            source_refs: claim.source_refs
          }, joinPointer("/claims", index), fallbackSourceRefs);
        }
        for (const gapId of asList(claim.gap_refs)) {
          addRelation(relations, artifactType, artifact, {
            id: `proof.claim_gap.${claim.id}.${gapId}`,
            type: "gapped_by",
            from: claim.id,
            to: gapId,
            source_refs: claim.source_refs
          }, joinPointer("/claims", index), fallbackSourceRefs);
        }
      });
    }

    if (artifactType === "evidenceIndex") {
      addArray(records, artifactType, artifact, "evidence", artifact.evidence, "/evidence", fallbackSourceRefs);
      asList(artifact.evidence).forEach((evidence, index) => {
        for (const claimId of [...asList(evidence.claim_ids), ...asList(evidence.supports)]) {
          addRelation(relations, artifactType, artifact, {
            id: `evidence.supports.${evidence.id}.${claimId}`,
            type: "supports",
            from: evidence.id,
            to: claimId,
            source_refs: evidence.source_refs
          }, joinPointer("/evidence", index), fallbackSourceRefs);
        }
      });
    }

    if (artifactType === "debt") {
      addArray(records, artifactType, artifact, "debt", artifact.records, "/records", fallbackSourceRefs);
      asList(artifact.records).forEach((record, index) => {
        if (record.subject) {
          addRelation(relations, artifactType, artifact, {
            id: `debt.blocks.${record.id}.${record.subject}`,
            type: "blocks",
            from: record.id,
            to: record.subject,
            source_refs: record.source_refs
          }, joinPointer("/records", index), fallbackSourceRefs);
        }
      });
    }
  }

  return {
    records: records.sort((left, right) => left.key.localeCompare(right.key)),
    relations: relations.sort((left, right) => left.id.localeCompare(right.id))
  };
}

export function createArtifactIndex(artifactSet = {}) {
  const { records, relations } = collectRecords(artifactSet);
  const generatedFrom = [...new Set(records.map((record) => record.artifact_path))].sort();
  const index = {
    schema_version: CONTRACT_SCHEMA_VERSION,
    generated_from: generatedFrom.length > 0 ? generatedFrom : [".seal/*.yaml"],
    notice: `${GENERATED_VIEW_NOTICE} Canonical truth remains in the source artifacts; regenerate this index when sources change.`,
    freshness: {
      status: "current",
      generated_at: GENERATED_AT
    },
    stats: {
      record_count: records.length,
      relation_count: relations.length,
      byte_count: 0
    },
    records,
    relations
  };
  index.stats.byte_count = Buffer.byteLength(YAML.stringify(index, { lineWidth: 0 }), "utf8");
  return index;
}

export function resolveArtifactRecords(index, query = {}) {
  const relationTypes = new Set(asList(query.relation).map((relation) => typeof relation === "string" ? relation : relation.type).filter(Boolean));
  const relationMatches = new Set();
  if (relationTypes.size > 0 || query.relation?.from || query.relation?.to) {
    for (const relation of asList(index?.relations)) {
      const typeMatches = relationTypes.size === 0 || relationTypes.has(relation.type);
      const fromMatches = !query.relation?.from || normalizeId(query.relation.from) === normalizeId(relation.from);
      const toMatches = !query.relation?.to || normalizeId(query.relation.to) === normalizeId(relation.to);
      if (typeMatches && fromMatches && toMatches) {
        relationMatches.add(normalizeId(relation.from));
        relationMatches.add(normalizeId(relation.to));
      }
    }
  }

  return asList(index?.records).filter((record) => {
    if (query.id && normalizeId(record.id) !== normalizeId(query.id)) return false;
    if (query.path && normalizePath(record.path ?? record.id) !== normalizePath(query.path)) return false;
    if (query.kind && record.kind !== query.kind) return false;
    if (query.artifactType && record.artifact_type !== query.artifactType) return false;
    if (query.impactTarget && !asList(record.impact_targets).map(normalizeId).includes(normalizeId(query.impactTarget))) return false;
    if (relationMatches.size > 0 && !relationMatches.has(normalizeId(record.id)) && !relationMatches.has(normalizeId(record.path))) return false;
    return true;
  });
}

export function resolveArtifactRecordsById(index, id) {
  return resolveArtifactRecords(index, { id });
}

export function resolveArtifactRecordsByPath(index, recordPath) {
  return resolveArtifactRecords(index, { path: recordPath });
}

export function resolveArtifactRecordsByRelation(index, relation) {
  return resolveArtifactRecords(index, { relation });
}

export function resolveArtifactRecordsByImpactTarget(index, impactTarget) {
  return resolveArtifactRecords(index, { impactTarget });
}

export function validateArtifactIndex(index, artifactSet = {}) {
  const errors = [];
  const records = asList(index?.records);
  const relations = asList(index?.relations);

  for (const [recordIndex, record] of records.entries()) {
    if (!record?.hash) {
      errors.push({ code: "missing_hash", path: `/records/${recordIndex}/hash`, message: `Index record ${record?.key ?? recordIndex} is missing a sha256 hash.` });
    }
    if (record?.summary && record.summary.length > ARTIFACT_INDEX_SUMMARY_MAX) {
      errors.push({ code: "oversized_summary", path: `/records/${recordIndex}/summary`, message: `Index record ${record.key} summary exceeds ${ARTIFACT_INDEX_SUMMARY_MAX} characters.` });
    }
    if (record?.freshness?.hash && record.hash && record.freshness.hash !== record.hash) {
      errors.push({ code: "stale_record", path: `/records/${recordIndex}/freshness/hash`, message: `Index record ${record.key} freshness hash does not match record hash.` });
    }
  }

  const comparableArtifactSet = Object.fromEntries(Object.entries(artifactSet).filter(([key]) => key !== "artifactIndex"));
  if (topLevelArtifacts(comparableArtifactSet).length > 0) {
    const expected = createArtifactIndex(comparableArtifactSet);
    const actualByKey = new Map(records.map((record, index) => [record.key, { record, index }]));
    const expectedByKey = new Map(expected.records.map((record) => [record.key, record]));

    for (const expectedRecord of expected.records) {
      const actual = actualByKey.get(expectedRecord.key);
      if (!actual) {
        errors.push({ code: "missing_record", path: "/records", message: `Index is missing generated record ${expectedRecord.key}.` });
        continue;
      }
      if (actual.record.hash !== expectedRecord.hash) {
        errors.push({ code: "stale_record", path: `/records/${actual.index}/hash`, message: `Index record ${expectedRecord.key} is stale against canonical artifacts.` });
      }
    }

    for (const [key, actual] of actualByKey.entries()) {
      if (!expectedByKey.has(key)) {
        errors.push({ code: "dangling_record", path: `/records/${actual.index}`, message: `Index record ${key} no longer exists in canonical artifacts.` });
      }
    }
  }

  const recordTargets = new Set(records.flatMap((record) => [record.id, record.path]).filter(Boolean).map(normalizeId));
  relations.forEach((relation, index) => {
    for (const endpoint of ["from", "to"]) {
      if (!recordTargets.has(normalizeId(relation?.[endpoint]))) {
        errors.push({ code: "dangling_relation", path: `/relations/${index}/${endpoint}`, message: `Index relation ${relation?.id ?? index} ${endpoint} does not resolve to an indexed record.` });
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors
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

async function readArtifactsInDir(root, relativeDir, pattern) {
  const artifactDir = path.join(root, relativeDir);
  try {
    const entries = await readdir(artifactDir, { withFileTypes: true });
    const artifacts = [];
    for (const entry of entries.filter((item) => item.isFile() && pattern.test(item.name)).sort((left, right) => left.name.localeCompare(right.name))) {
      artifacts.push(await parseYamlArtifact(path.join(artifactDir, entry.name)));
    }
    return artifacts;
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function readSealArtifactSet(rootPath) {
  const root = path.resolve(rootPath);
  const [sources, plan, map, trace, proof, evidenceIndex, debt, contextPack, impacts, flies] = await Promise.all([
    readOptionalArtifact(path.join(root, ".seal", "sources.yaml")),
    readOptionalArtifact(path.join(root, ".seal", "plan.yaml")),
    readOptionalArtifact(path.join(root, ".seal", "map.yaml")),
    readOptionalArtifact(path.join(root, ".seal", "trace.yaml")),
    readOptionalArtifact(path.join(root, ".seal", "proof.yaml")),
    readOptionalArtifact(path.join(root, ".seal", "evidence", "index.yaml")),
    readOptionalArtifact(path.join(root, ".seal", "debt.yaml")),
    readOptionalArtifact(path.join(root, ".seal", "context-pack.yaml")),
    readArtifactsInDir(root, path.join(".seal", "impacts"), /^IMPACT-.+\.ya?ml$/),
    readArtifactsInDir(root, path.join(".seal", "fly"), /^FLY-.+\.ya?ml$/)
  ]);

  return {
    sources,
    plan,
    map,
    trace,
    impacts,
    proof,
    evidenceIndex,
    debt,
    flies,
    contextPack
  };
}

export async function writeArtifactIndex(rootPath, artifactSet) {
  const root = path.resolve(rootPath);
  const sourceSet = artifactSet ?? await readSealArtifactSet(root);
  const artifactIndex = createArtifactIndex(sourceSet);
  const outputPath = path.join(root, ARTIFACT_INDEX_PATH);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, YAML.stringify(artifactIndex, { lineWidth: 0 }), "utf8");
  return { artifactIndex, outputPath };
}
