import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { createOntologyArtifact, stringifyArtifact } from "../artifacts/generate.mjs";
import { parseYamlArtifact } from "../artifacts/schema-registry.mjs";

const knownMapKeys = new Set([
  "schema_version",
  "purpose",
  "boundary",
  "observed",
  "approved",
  "drift",
  "components",
  "files",
  "dependencies",
  "services",
  "interfaces",
  "data_stores",
  "tests",
  "unknowns",
  "sources",
  "requirements",
  "risks",
  "assumptions",
  "trace_links",
  "relationships",
  "launch_gates",
  "gaps"
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

async function readOptionalYaml(filePath) {
  if (!await fileExists(filePath)) {
    return null;
  }
  return parseYamlArtifact(filePath);
}

function idFrom(record, fields = ["ontology_id", "id", "path", "name"]) {
  for (const field of fields) {
    if (record?.[field]) {
      return String(record[field]);
    }
  }
  return null;
}

function idsFrom(records, fields) {
  return [...new Set(asArray(records).map((record) => idFrom(record, fields)).filter(Boolean))];
}

function sourceRefsFrom(...artifacts) {
  const refs = [];
  for (const artifact of artifacts.filter(Boolean)) {
    refs.push(...asArray(artifact.source_refs));
    refs.push(...asArray(artifact.purpose?.source_refs));
    refs.push(...asArray(artifact.change?.source_refs));
    refs.push(...asArray(artifact.sources).map((source) => source?.id).filter(Boolean));
    refs.push(...asArray(artifact.claims).flatMap((claim) => asArray(claim?.source_refs)));
    refs.push(...asArray(artifact.evidence).flatMap((evidence) => asArray(evidence?.source_refs)));
    refs.push(...asArray(artifact.gaps).flatMap((gap) => asArray(gap?.source_refs)));
  }
  return [...new Set(refs.filter(Boolean))];
}

function discoveredIds({ map, proof, evidenceIndex }) {
  return {
    components: idsFrom(map?.components),
    files: idsFrom(map?.files, ["ontology_id", "path", "id"]),
    dependencies: idsFrom(map?.dependencies, ["ontology_id", "id", "name"]),
    services: idsFrom(map?.services?.discovered ?? map?.services, ["ontology_id", "id", "name"]),
    interfaces: idsFrom(map?.interfaces),
    data_stores: idsFrom(map?.data_stores),
    tests: idsFrom(map?.tests, ["ontology_id", "id", "path"]),
    requirements: idsFrom(map?.requirements),
    risks: idsFrom(map?.risks),
    assumptions: idsFrom(map?.assumptions),
    trace_relations: idsFrom([...(asArray(map?.trace_links)), ...(asArray(map?.relationships))]),
    claims: idsFrom(proof?.claims),
    evidence: idsFrom([...(asArray(proof?.evidence)), ...(asArray(evidenceIndex?.evidence))]),
    gaps: idsFrom([...(asArray(map?.unknowns)), ...(asArray(map?.gaps)), ...(asArray(map?.drift)), ...(asArray(proof?.gaps))])
  };
}

function migrationGapId(artifactName, key) {
  const cleaned = String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `gap.ontology-migration.${artifactName}-${cleaned || "field"}`;
}

function unmappedFieldGaps(map, sourceRefs) {
  return Object.keys(map ?? {})
    .filter((key) => !knownMapKeys.has(key))
    .sort()
    .map((key) => ({
      id: migrationGapId("map", key),
      summary: `Legacy MAP field "${key}" has no ontology v1 mapping yet.`,
      missing: `Ontology v1 mapping for .seal/map.yaml field "${key}".`,
      closure_method: "Map this legacy field to a supported ontology record, or keep it as an explicit migration gap.",
      status: "open",
      severity: "warning",
      source_refs: sourceRefs,
      authority_state: "repo_observed",
      approval_state: "not_required",
      confidence: 0.7
    }));
}

function applySourceRefs(value, sourceRefs) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => applySourceRefs(item, sourceRefs));
    return;
  }
  if (Array.isArray(value.source_refs)) {
    value.source_refs = [...sourceRefs];
  }
  Object.values(value).forEach((child) => applySourceRefs(child, sourceRefs));
}

export async function createBootstrappedOntology(rootPath) {
  const root = path.resolve(rootPath);
  const sealRoot = path.join(root, ".seal");
  const map = await readOptionalYaml(path.join(sealRoot, "map.yaml"));
  const proof = await readOptionalYaml(path.join(sealRoot, "proof.yaml"));
  const evidenceIndex = await readOptionalYaml(path.join(sealRoot, "evidence", "index.yaml"));
  const sourceRefs = sourceRefsFrom(map, proof, evidenceIndex);
  const effectiveSourceRefs = sourceRefs.length > 0 ? sourceRefs : ["src.ontology-bootstrap"];
  const ontology = createOntologyArtifact({ sourceId: effectiveSourceRefs[0] });
  applySourceRefs(ontology, effectiveSourceRefs);
  ontology.migration = {
    id: "migration.ontology-v1-bootstrap",
    summary: "Bootstrapped ontology v1 from existing canonical SEAL artifacts.",
    source_refs: effectiveSourceRefs,
    authority_state: "repo_observed",
    approval_state: "not_required",
    confidence: 0.8,
    preserves_existing_ontology: true,
    preserved_ids: discoveredIds({ map, proof, evidenceIndex }),
    gaps: unmappedFieldGaps(map, effectiveSourceRefs)
  };
  return ontology;
}

export async function bootstrapOntologyIfMissing(rootPath) {
  const root = path.resolve(rootPath);
  const sealRoot = path.join(root, ".seal");
  const outputPath = path.join(sealRoot, "ontology.yaml");
  if (await fileExists(outputPath)) {
    return { created: false, outputPath };
  }

  await mkdir(sealRoot, { recursive: true });
  const ontology = await createBootstrappedOntology(root);
  await writeFile(outputPath, stringifyArtifact(ontology), "utf8");
  return { created: true, outputPath, ontology };
}
