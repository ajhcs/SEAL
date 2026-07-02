import { createHash } from "node:crypto";
import path from "node:path";
import YAML from "yaml";

import { CONTRACT_SCHEMA_VERSION, GENERATED_VIEW_NOTICE } from "../contracts/constants.mjs";
import { ARTIFACT_LAYOUT, createArtifactStore } from "./store.mjs";

export const ARTIFACT_INDEX_PATH = ".seal/index.yaml";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asOneOrMany(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/");
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

function hashRecord(record) {
  return createHash("sha256").update(JSON.stringify(stableValue(record))).digest("hex");
}

function summaryFor(record, fallback) {
  const text = record?.summary ?? record?.purpose ?? record?.statement ?? record?.description ?? record?.name ?? fallback;
  return String(text ?? fallback).slice(0, 280);
}

function sourceRefs(record, fallback = []) {
  return [...new Set([
    ...asArray(record?.source_refs),
    ...asArray(record?.purpose?.source_refs),
    ...asArray(record?.change?.source_refs),
    ...asArray(fallback)
  ].filter(Boolean))].sort();
}

function sourceRefsFromTree(value) {
  const refs = new Set();
  const visit = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    asArray(node.source_refs).forEach((ref) => refs.add(ref));
    asArray(node.purpose?.source_refs).forEach((ref) => refs.add(ref));
    if (node.kind && node.id && !node.source_refs) {
      refs.add(node.id);
    }
    Object.values(node).forEach(visit);
  };
  visit(value);
  return [...refs].filter(Boolean).sort();
}

function recordId(record, fields = ["ontology_id", "id", "path", "ref", "name"]) {
  for (const field of fields) {
    if (record?.[field]) {
      return normalizePath(record[field]);
    }
  }
  return "";
}

function addRecord(records, { artifactType, artifactPath, kind, record, pointer, fallbackSourceRefs = [] }) {
  if (!record || typeof record !== "object") {
    return;
  }
  const id = recordId(record);
  if (!id) {
    return;
  }
  const refs = sourceRefs(record, fallbackSourceRefs);
  records.push({
    key: `${artifactType}:${kind}:${id}:${pointer}`,
    id,
    kind,
    artifact_type: artifactType,
    artifact_path: artifactPath,
    json_pointer: pointer,
    summary: summaryFor(record, `${kind} ${id}`),
    source_refs: refs.length > 0 ? refs : [id],
    hash: hashRecord(record),
    path: record.path ? normalizePath(record.path) : undefined
  });
}

function addCollection(records, options, values, pointer) {
  asArray(values).forEach((record, index) => addRecord(records, {
    ...options,
    record,
    pointer: `${pointer}/${index}`
  }));
}

function collectArtifactRecords(artifactType, artifactPath, artifact) {
  const records = [];
  const fallbackSourceRefs = sourceRefsFromTree(artifact);
  addRecord(records, {
    artifactType,
    artifactPath,
    kind: artifactType,
    record: { id: artifact?.id ?? artifactType, summary: `${artifactType} artifact`, source_refs: fallbackSourceRefs },
    pointer: "/",
    fallbackSourceRefs
  });

  if (artifactType === "sources") addCollection(records, { artifactType, artifactPath, kind: "source", fallbackSourceRefs }, artifact.sources, "/sources");
  if (artifactType === "map") {
    addCollection(records, { artifactType, artifactPath, kind: "component", fallbackSourceRefs }, artifact.components, "/components");
    addCollection(records, { artifactType, artifactPath, kind: "file", fallbackSourceRefs }, artifact.files, "/files");
    addCollection(records, { artifactType, artifactPath, kind: "dependency", fallbackSourceRefs }, artifact.dependencies, "/dependencies");
    addCollection(records, { artifactType, artifactPath, kind: "service", fallbackSourceRefs }, artifact.services?.discovered, "/services/discovered");
    addCollection(records, { artifactType, artifactPath, kind: "interface", fallbackSourceRefs }, artifact.interfaces, "/interfaces");
    addCollection(records, { artifactType, artifactPath, kind: "data_store", fallbackSourceRefs }, artifact.data_stores, "/data_stores");
    addCollection(records, { artifactType, artifactPath, kind: "test", fallbackSourceRefs }, artifact.tests, "/tests");
    addCollection(records, { artifactType, artifactPath, kind: "gap", fallbackSourceRefs }, artifact.unknowns, "/unknowns");
    addCollection(records, { artifactType, artifactPath, kind: "gap", fallbackSourceRefs }, artifact.gaps, "/gaps");
    addCollection(records, { artifactType, artifactPath, kind: "trace_relation", fallbackSourceRefs }, artifact.relationships, "/relationships");
  }
  if (artifactType === "plan") {
    addCollection(records, { artifactType, artifactPath, kind: "scope", fallbackSourceRefs }, artifact.scope, "/scope");
    addCollection(records, { artifactType, artifactPath, kind: "acceptance_criterion", fallbackSourceRefs }, artifact.acceptance_criteria, "/acceptance_criteria");
    addCollection(records, { artifactType, artifactPath, kind: "proof_obligation", fallbackSourceRefs }, artifact.proof_obligations, "/proof_obligations");
  }
  if (artifactType === "trace") addCollection(records, { artifactType, artifactPath, kind: "trace_relation", fallbackSourceRefs }, artifact.relations, "/relations");
  if (artifactType === "impact") {
    if (artifact.affected && typeof artifact.affected === "object" && !Array.isArray(artifact.affected)) {
      Object.entries(artifact.affected).forEach(([section, values]) => {
        addCollection(records, { artifactType, artifactPath, kind: "impact_target", fallbackSourceRefs }, values, `/affected/${section}`);
      });
    } else {
      addCollection(records, { artifactType, artifactPath, kind: "impact_target", fallbackSourceRefs }, artifact.affected, "/affected");
    }
    addCollection(records, { artifactType, artifactPath, kind: "proof_requirement", fallbackSourceRefs }, artifact.proof_required, "/proof_required");
    addCollection(records, { artifactType, artifactPath, kind: "gap", fallbackSourceRefs }, [...asArray(artifact.blocking_unknowns), ...asArray(artifact.gaps)], "/gaps");
  }
  if (artifactType === "proof") {
    addCollection(records, { artifactType, artifactPath, kind: "proof_claim", fallbackSourceRefs }, artifact.claims, "/claims");
    addCollection(records, { artifactType, artifactPath, kind: "proof_evidence", fallbackSourceRefs }, artifact.evidence, "/evidence");
    addCollection(records, { artifactType, artifactPath, kind: "gap", fallbackSourceRefs }, artifact.gaps, "/gaps");
  }
  if (artifactType === "evidenceIndex") addCollection(records, { artifactType, artifactPath, kind: "evidence", fallbackSourceRefs }, artifact.evidence, "/evidence");
  if (artifactType === "debt") addCollection(records, { artifactType, artifactPath, kind: "debt", fallbackSourceRefs }, artifact.records, "/records");
  if (artifactType === "fly") {
    addCollection(records, { artifactType, artifactPath, kind: "action", fallbackSourceRefs }, artifact.actions, "/actions");
    addCollection(records, { artifactType, artifactPath, kind: "state_transition", fallbackSourceRefs }, artifact.state_transitions, "/state_transitions");
  }

  return records;
}

function artifactEntries(artifactSet) {
  const impacts = [
    ...asOneOrMany(artifactSet.impact),
    ...asArray(artifactSet.impacts)
  ];
  const flyRecords = [
    ...asOneOrMany(artifactSet.fly),
    ...asArray(artifactSet.flyRecords)
  ];
  return [
    ["ontology", ARTIFACT_LAYOUT.canonical.ontology.path, artifactSet.ontology],
    ["sources", ARTIFACT_LAYOUT.canonical.sources.path, artifactSet.sources],
    ["plan", ARTIFACT_LAYOUT.canonical.plan.path, artifactSet.plan],
    ["map", ARTIFACT_LAYOUT.canonical.map.path, artifactSet.map],
    ["trace", ARTIFACT_LAYOUT.canonical.trace.path, artifactSet.trace],
    ...impacts.map((artifact) => ["impact", `.seal/impacts/${artifact.id ?? "IMPACT"}.yaml`, artifact]),
    ["proof", ARTIFACT_LAYOUT.canonical.proof.path, artifactSet.proof],
    ["evidenceIndex", ARTIFACT_LAYOUT.canonical.evidenceIndex.path, artifactSet.evidenceIndex],
    ["debt", ARTIFACT_LAYOUT.canonical.debt.path, artifactSet.debt],
    ...flyRecords.map((artifact) => ["fly", `.seal/fly/${artifact.id ?? "FLY"}.yaml`, artifact]),
    ["contextPack", ARTIFACT_LAYOUT.canonical.contextPack.path, artifactSet.contextPack]
  ].filter(([, , artifact]) => artifact && typeof artifact === "object");
}

export function createArtifactIndex(artifactSet = {}) {
  const records = artifactEntries(artifactSet)
    .flatMap(([artifactType, artifactPath, artifact]) => collectArtifactRecords(artifactType, artifactPath, artifact))
    .sort((left, right) => left.key.localeCompare(right.key));
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    generated_from: [...new Set(records.map((record) => record.artifact_path))].sort(),
    notice: `${GENERATED_VIEW_NOTICE} Canonical truth remains in the source artifacts.`,
    stats: {
      record_count: records.length
    },
    records
  };
}

export function resolveArtifactRecords(index, query = {}) {
  return asArray(index?.records).filter((record) => {
    if (query.id && record.id !== normalizePath(query.id)) return false;
    if (query.path && (record.path ?? record.id) !== normalizePath(query.path)) return false;
    if (query.kind && record.kind !== query.kind) return false;
    if (query.artifactType && record.artifact_type !== query.artifactType) return false;
    return true;
  });
}

export async function readSealArtifactSet(rootPath) {
  const store = createArtifactStore(path.resolve(rootPath));
  return (await store.readAllCanonicalSet()).artifactSet;
}

export async function writeArtifactIndex(rootPath, artifactSet) {
  const store = createArtifactStore(path.resolve(rootPath));
  const sourceSet = artifactSet ?? await readSealArtifactSet(store.root);
  const artifactIndex = createArtifactIndex(sourceSet);
  const { filePath: outputPath } = await store.writeDerived("artifactIndex", YAML.stringify(artifactIndex, { lineWidth: 0 }), {
    reason: "refresh_artifact_index"
  });
  return { artifactIndex, outputPath };
}
