import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { CONTRACT_SCHEMA_VERSION, GENERATED_VIEW_NOTICE } from "../contracts/constants.mjs";
import { stringifyArtifact } from "./generate.mjs";
import { parseYamlArtifact } from "./schema-registry.mjs";

const fixedArtifactSpecs = Object.freeze([
  { kind: "sources", path: ".seal/sources.yaml", authoritative: true },
  { kind: "plan", path: ".seal/plan.yaml", authoritative: true },
  { kind: "map", path: ".seal/map.yaml", authoritative: true },
  { kind: "trace", path: ".seal/trace.yaml", authoritative: true },
  { kind: "debt", path: ".seal/debt.yaml", authoritative: true },
  { kind: "proof", path: ".seal/proof.yaml", authoritative: true },
  { kind: "evidence_index", path: ".seal/evidence/index.yaml", authoritative: true },
  { kind: "context_pack", path: ".seal/context-pack.yaml", authoritative: false, generated: true }
]);

const directoryArtifactSpecs = Object.freeze([
  { kind: "impact", dir: ".seal/impacts", pattern: /^IMPACT-.+\.ya?ml$/, authoritative: true },
  { kind: "fly", dir: ".seal/fly", pattern: /^FLY-.+\.ya?ml$/, authoritative: false, generated: true }
]);

function normalizeArtifactPath(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function relativeArtifactPath(root, filePath) {
  return normalizeArtifactPath(path.relative(root, filePath));
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readDirectory(root, dir) {
  try {
    return await readdir(path.join(root, dir), { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function asList(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].sort();
}

function escapePointerPart(part) {
  return String(part).replaceAll("~", "~0").replaceAll("/", "~1");
}

function pointerChild(pointer, part) {
  return `${pointer === "/" ? "" : pointer}/${escapePointerPart(part)}`;
}

function recordIdentifier(record) {
  return record?.id ?? record?.path ?? record?.ref ?? record?.name;
}

function artifactIdFor(kind, artifact) {
  return artifact?.id ?? `artifact.${kind}`;
}

function recordKind(kind, pointer, record) {
  if (record?.kind) {
    return String(record.kind);
  }
  const lowerPointer = pointer.toLowerCase();
  if (lowerPointer.includes("/components/")) {
    return "component";
  }
  if (lowerPointer.includes("/files/")) {
    return "file";
  }
  if (lowerPointer.includes("/claims/")) {
    return "claim";
  }
  if (lowerPointer.includes("/evidence/")) {
    return "evidence";
  }
  if (lowerPointer.includes("/gaps/") || lowerPointer.includes("/blocking_unknowns/")) {
    return "gap";
  }
  if (lowerPointer.includes("/links/")) {
    return "trace_link";
  }
  if (lowerPointer.includes("/affected")) {
    return "affected_target";
  }
  return kind;
}

function sourceRefs(record) {
  return uniqueStrings(asList(record?.source_refs));
}

function collectReferenceValues(value) {
  const refs = [];
  for (const item of asList(value)) {
    if (typeof item === "string") {
      refs.push(item);
    } else if (item && typeof item === "object") {
      refs.push(item.id, item.ref, item.path, item.claim_id, item.gap_id, item.target);
    }
  }
  return refs;
}

function relationIds(record) {
  return uniqueStrings([
    ...collectReferenceValues(record?.trace_refs),
    ...collectReferenceValues(record?.evidence_refs),
    ...collectReferenceValues(record?.gap_refs),
    ...collectReferenceValues(record?.counterevidence_refs),
    ...collectReferenceValues(record?.claim_ids),
    ...collectReferenceValues(record?.supports),
    ...collectReferenceValues(record?.refutes),
    ...collectReferenceValues(record?.blocks),
    ...collectReferenceValues(record?.proof_refs),
    ...collectReferenceValues(record?.proof_needed),
    ...collectReferenceValues(record?.proof_required),
    record?.component_id,
    record?.owner_component_id,
    record?.from,
    record?.to,
    record?.target_id,
    record?.source_id
  ]);
}

function affectedTargets(record, pointer, artifact) {
  const targets = [];
  if (pointer.includes("/affected")) {
    targets.push(record?.id, record?.path, record?.ref);
  }
  if (artifact?.change?.target) {
    targets.push(artifact.change.target);
  }
  if (record?.target) {
    targets.push(record.target);
  }
  return uniqueStrings(targets.map(normalizeArtifactPath));
}

function collectRecords({ artifact, artifactEntry, value, pointer = "/", records = [], knownIds = new Set() }) {
  if (!value || typeof value !== "object") {
    return { records, knownIds };
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectRecords({
        artifact,
        artifactEntry,
        value: item,
        pointer: pointerChild(pointer, index),
        records,
        knownIds
      });
    });
    return { records, knownIds };
  }

  const id = recordIdentifier(value);
  if (id && pointer !== "/") {
    const normalizedId = String(id);
    knownIds.add(normalizedId);
    records.push({
      id: normalizedId,
      kind: recordKind(artifactEntry.kind, pointer, value),
      artifact_id: artifactEntry.id,
      artifact_path: artifactEntry.path,
      pointer,
      source_refs: sourceRefs(value),
      relation_ids: relationIds(value),
      affected_targets: affectedTargets(value, pointer, artifact)
    });
  }

  for (const [key, child] of Object.entries(value)) {
    collectRecords({
      artifact,
      artifactEntry,
      value: child,
      pointer: pointerChild(pointer, key),
      records,
      knownIds
    });
  }

  return { records, knownIds };
}

async function discoverIndexableArtifactFiles(root) {
  const files = [];
  for (const spec of fixedArtifactSpecs) {
    const filePath = path.join(root, spec.path);
    if (await fileExists(filePath)) {
      files.push({ ...spec, filePath });
    }
  }

  for (const spec of directoryArtifactSpecs) {
    const entries = await readDirectory(root, spec.dir);
    for (const entry of entries.filter((item) => item.isFile() && spec.pattern.test(item.name)).sort((left, right) => left.name.localeCompare(right.name))) {
      files.push({
        ...spec,
        path: normalizeArtifactPath(path.join(spec.dir, entry.name)),
        filePath: path.join(root, spec.dir, entry.name)
      });
    }
  }

  return files;
}

export async function buildArtifactIndex(rootPath) {
  const root = path.resolve(rootPath);
  const artifactFiles = await discoverIndexableArtifactFiles(root);
  const artifacts = [];
  const records = [];
  const knownIds = new Set(["artifact-index"]);
  const sourceRefValues = [];

  for (const file of artifactFiles) {
    const bytes = await readFile(file.filePath);
    const artifact = await parseYamlArtifact(file.filePath);
    const artifactEntry = {
      id: artifactIdFor(file.kind, artifact),
      kind: file.kind,
      path: relativeArtifactPath(root, file.filePath),
      authoritative: file.authoritative !== false,
      generated: file.generated === true,
      hash_algorithm: "sha256",
      hash: hashBytes(bytes),
      bytes: bytes.length,
      freshness: {
        indexed_at: new Date().toISOString(),
        state: "current"
      },
      source_refs: sourceRefs(artifact)
    };
    knownIds.add(artifactEntry.id);
    knownIds.add(artifactEntry.path);
    artifacts.push(artifactEntry);
    sourceRefValues.push(...artifactEntry.source_refs);
    const recordStart = records.length;
    collectRecords({ artifact, artifactEntry, value: artifact, records, knownIds });
    for (const record of records.slice(recordStart)) {
      sourceRefValues.push(...record.source_refs);
    }
  }

  const relations = records
    .flatMap((record) => record.relation_ids.map((target) => ({
      from: record.id,
      to: target,
      from_artifact: record.artifact_id,
      pointer: record.pointer
    })))
    .sort((left, right) => `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`));

  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    id: "artifact-index",
    kind: "generated_artifact_index",
    authoritative: false,
    generated_from: ".seal/*.yaml",
    notice: `${GENERATED_VIEW_NOTICE} This file is derived and non-authoritative.`,
    indexed_at: new Date().toISOString(),
    hash_algorithm: "sha256",
    artifacts: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
    records: records.sort((left, right) => `${left.artifact_path}:${left.pointer}`.localeCompare(`${right.artifact_path}:${right.pointer}`)),
    relations,
    source_refs: uniqueStrings(sourceRefValues),
    resolver_hints: {
      by_id: "resolveArtifactById(index, id)",
      by_path: "resolveArtifactByPath(index, path)",
      by_relation: "resolveRecordsByRelation(index, id)",
      by_affected_target: "resolveRecordsByAffectedTarget(index, target)"
    }
  };
}

export async function writeArtifactIndex(rootPath) {
  const root = path.resolve(rootPath);
  const index = await buildArtifactIndex(root);
  const outputPath = path.join(root, ".seal", "index.yaml");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stringifyArtifact(index), "utf8");
  return { index, outputPath };
}

export async function loadArtifactIndex(rootPath) {
  return parseYamlArtifact(path.join(path.resolve(rootPath), ".seal", "index.yaml"));
}

export function resolveArtifactById(index, id) {
  if (index?.id === id) {
    return index;
  }
  return asList(index?.artifacts).find((artifact) => artifact.id === id);
}

export function resolveArtifactByPath(index, artifactPath) {
  const normalizedPath = normalizeArtifactPath(artifactPath);
  return asList(index?.artifacts).find((artifact) => artifact.path === normalizedPath);
}

export function resolveRecordsByRelation(index, relationId) {
  return asList(index?.records).filter((record) => asList(record.relation_ids).includes(relationId));
}

export function resolveRecordsByAffectedTarget(index, target) {
  const normalizedTarget = normalizeArtifactPath(target);
  return asList(index?.records).filter((record) => asList(record.affected_targets).includes(normalizedTarget));
}

function indexError(code, entryPath, message, details = {}) {
  return {
    code,
    path: entryPath,
    message,
    ...details
  };
}

function shouldCheckReference(ref) {
  if (!ref || typeof ref !== "string") {
    return false;
  }
  return /^(artifact\.|src\.|cmp\.|claim\.|ev\.|gap\.|proofreq\.|IMPACT-|PLAN-|tests?\/|src\/|\.seal\/)/.test(ref) || ref.includes("/");
}

export async function validateArtifactIndex(rootPath) {
  const root = path.resolve(rootPath);
  const indexPath = path.join(root, ".seal", "index.yaml");
  if (!(await fileExists(indexPath))) {
    return { valid: true, skipped: true, errors: [] };
  }

  const errors = [];
  let index;
  try {
    index = await parseYamlArtifact(indexPath);
  } catch (error) {
    return {
      valid: false,
      skipped: false,
      errors: [indexError("parse_error", "/", `artifact index could not be parsed: ${error.message}`, { file: indexPath })]
    };
  }

  const artifacts = asList(index.artifacts);
  if (index.authoritative !== false) {
    errors.push(indexError("authoritative_index", "/authoritative", "artifact index must be marked non-authoritative.", { expected: false, actual: index.authoritative }));
  }

  const knownRefs = new Set([index.id, "artifact-index"]);
  for (const artifact of artifacts) {
    knownRefs.add(artifact.id);
    knownRefs.add(normalizeArtifactPath(artifact.path));
  }
  for (const record of asList(index.records)) {
    knownRefs.add(record.id);
    for (const sourceRef of asList(record.source_refs)) {
      knownRefs.add(sourceRef);
    }
  }
  for (const sourceRef of asList(index.source_refs)) {
    knownRefs.add(sourceRef);
  }

  for (const [artifactIndex, artifact] of artifacts.entries()) {
    const artifactPointer = `/artifacts/${artifactIndex}`;
    const artifactPath = normalizeArtifactPath(artifact.path);
    const absolutePath = path.join(root, artifactPath);
    if (!artifact.path) {
      errors.push(indexError("missing_path", `${artifactPointer}/path`, "artifact index entry is missing a path.", { expected: "artifact path", actual: "missing" }));
      continue;
    }
    if (!artifact.hash) {
      errors.push(indexError("missing_hash", `${artifactPointer}/hash`, `artifact index entry for ${artifactPath} is missing a hash.`, { expected: "sha256 hash", actual: "missing", file: absolutePath }));
    }
    if (typeof artifact.bytes !== "number") {
      errors.push(indexError("missing_bytes", `${artifactPointer}/bytes`, `artifact index entry for ${artifactPath} is missing byte count.`, { expected: "byte count", actual: artifact.bytes ?? "missing", file: absolutePath }));
    }
    if (!(await fileExists(absolutePath))) {
      errors.push(indexError("missing_artifact", `${artifactPointer}/path`, `artifact index references missing artifact ${artifactPath}.`, { expected: "existing artifact path", actual: "missing", file: absolutePath }));
      continue;
    }
    const bytes = await readFile(absolutePath);
    const actualHash = hashBytes(bytes);
    if (artifact.hash && artifact.hash !== actualHash) {
      errors.push(indexError("stale_hash", `${artifactPointer}/hash`, `artifact index hash is stale for ${artifactPath}.`, { expected: artifact.hash, actual: actualHash, file: absolutePath }));
    }
    if (typeof artifact.bytes === "number" && artifact.bytes !== bytes.length) {
      errors.push(indexError("stale_bytes", `${artifactPointer}/bytes`, `artifact index byte count is stale for ${artifactPath}.`, { expected: artifact.bytes, actual: bytes.length, file: absolutePath }));
    }
  }

  for (const [recordIndex, record] of asList(index.records).entries()) {
    for (const relationId of asList(record.relation_ids)) {
      if (shouldCheckReference(relationId) && !knownRefs.has(relationId)) {
        errors.push(indexError("dangling_index_ref", `/records/${recordIndex}/relation_ids`, `artifact index record ${record.id} references missing relation ${relationId}.`, { expected: "known artifact, record, source, or path id", actual: relationId }));
      }
    }
  }

  return {
    valid: errors.length === 0,
    skipped: false,
    errors
  };
}
