import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseYamlArtifact, validateArtifact } from "./schema-registry.mjs";

export const ARTIFACT_AUTHORITIES = Object.freeze({
  CANONICAL: "canonical",
  GENERATED: "generated",
  CANDIDATE: "candidate"
});

export class CanonicalArtifactSetError extends Error {
  constructor(message, diagnostics = []) {
    super(message);
    this.name = "CanonicalArtifactSetError";
    this.diagnostics = diagnostics;
  }
}

const fixedArtifactSpecs = Object.freeze([
  { key: "sources", artifactType: "sources", kind: "sources", path: ".seal/sources.yaml", required: true },
  { key: "plan", artifactType: "plan", kind: "plan", path: ".seal/plan.yaml", required: true },
  { key: "map", artifactType: "map", kind: "map", path: ".seal/map.yaml", required: true },
  { key: "trace", artifactType: "trace", kind: "trace", path: ".seal/trace.yaml", required: true },
  { key: "debt", artifactType: "debt", kind: "debt", path: ".seal/debt.yaml", required: true },
  { key: "proof", artifactType: "proof", kind: "proof", path: ".seal/proof.yaml", required: true },
  { key: "evidenceIndex", artifactType: "evidenceIndex", kind: "evidence_index", path: ".seal/evidence/index.yaml", required: true }
]);

const impactSpec = Object.freeze({
  key: "impacts",
  artifactType: "impact",
  kind: "impact",
  dir: ".seal/impacts",
  pattern: /^IMPACT-.+\.ya?ml$/
});

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeArtifactPath(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].sort();
}

function artifactId(artifact, kind) {
  return artifact?.id ?? `artifact.${kind}`;
}

function collectSourceRefs(artifact) {
  return uniqueStrings([
    ...asList(artifact?.source_refs),
    ...asList(artifact?.sources).map((source) => source.id)
  ]);
}

function diagnostic(code, artifactPath, message, details = {}) {
  return { code, path: artifactPath, message, ...details };
}

async function readCanonicalEntry(root, spec, loadedAt) {
  const absolutePath = path.join(root, spec.path);
  let raw;
  try {
    raw = await readFile(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT" && spec.required) {
      throw new CanonicalArtifactSetError(`Missing canonical artifact: ${spec.path}`, [
        diagnostic("missing_canonical_artifact", spec.path, `Required canonical artifact ${spec.path} is missing.`, {
          artifactType: spec.artifactType
        })
      ]);
    }
    throw error;
  }

  const artifact = await parseYamlArtifact(absolutePath);
  const validation = await validateArtifact(spec.artifactType, artifact);
  if (!validation.valid) {
    throw new CanonicalArtifactSetError(`Invalid canonical artifact: ${spec.path}`, [
      diagnostic("invalid_canonical_artifact", spec.path, `${spec.kind} artifact failed schema validation.`, {
        artifactType: spec.artifactType,
        errors: validation.errors
      })
    ]);
  }

  const relativePath = normalizeArtifactPath(spec.path);
  return {
    key: spec.key,
    artifact,
    entry: {
      id: artifactId(artifact, spec.kind),
      kind: spec.kind,
      artifact_type: spec.artifactType,
      path: relativePath,
      authority: ARTIFACT_AUTHORITIES.CANONICAL,
      generated: false,
      hash: hashBytes(raw),
      bytes: raw.length,
      freshness: {
        loaded_at: loadedAt,
        status: "current"
      },
      relation_ids: uniqueStrings([
        ...asList(artifact?.trace_refs),
        ...asList(artifact?.claim_refs),
        ...asList(artifact?.gap_refs),
        ...asList(artifact?.source_refs)
      ]),
      source_refs: collectSourceRefs(artifact)
    }
  };
}

async function readImpactEntries(root, loadedAt) {
  const impactRoot = path.join(root, impactSpec.dir);
  let entries;
  try {
    entries = await readdir(impactRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const results = [];
  for (const entry of entries.filter((item) => item.isFile() && impactSpec.pattern.test(item.name)).sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = normalizeArtifactPath(path.join(impactSpec.dir, entry.name));
    results.push(await readCanonicalEntry(root, {
      key: impactSpec.key,
      artifactType: impactSpec.artifactType,
      kind: impactSpec.kind,
      path: relativePath,
      required: true
    }, loadedAt));
  }
  return results;
}

export async function loadCanonicalArtifactSet(rootPath = process.cwd()) {
  const root = path.resolve(rootPath);
  const loadedAt = new Date().toISOString();
  const diagnostics = [];
  const fixed = [];
  for (const spec of fixedArtifactSpecs) {
    try {
      fixed.push(await readCanonicalEntry(root, spec, loadedAt));
    } catch (error) {
      if (error instanceof CanonicalArtifactSetError) {
        diagnostics.push(...error.diagnostics);
        continue;
      }
      throw error;
    }
  }

  let impacts = [];
  try {
    impacts = await readImpactEntries(root, loadedAt);
  } catch (error) {
    if (error instanceof CanonicalArtifactSetError) {
      diagnostics.push(...error.diagnostics);
    } else {
      throw error;
    }
  }

  if (diagnostics.length > 0) {
    throw new CanonicalArtifactSetError("Canonical artifact set could not be loaded.", diagnostics);
  }

  const artifacts = {};
  for (const result of fixed) {
    artifacts[result.key] = result.artifact;
  }
  artifacts.impacts = impacts.map((result) => result.artifact);

  const entries = [...fixed.map((result) => result.entry), ...impacts.map((result) => result.entry)]
    .sort((left, right) => left.path.localeCompare(right.path));
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  return {
    authority: ARTIFACT_AUTHORITIES.CANONICAL,
    source: "disk",
    root,
    loaded_at: loadedAt,
    artifacts,
    entries,
    paths: entries.map((entry) => entry.path),
    diagnostics,
    summary: {
      canonical_artifacts: entries.length,
      required_artifacts: fixedArtifactSpecs.length,
      impacts: impacts.length,
      bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0)
    },
    getByPath(pathValue) {
      return byPath.get(normalizeArtifactPath(pathValue));
    },
    getById(id) {
      return byId.get(id);
    }
  };
}
