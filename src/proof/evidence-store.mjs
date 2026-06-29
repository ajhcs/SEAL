import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const allowedSourceKinds = new Set(["command", "static_inspection", "external_source", "human_review", "gap_record"]);

function safePathPart(value) {
  return value.toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "") || "evidence";
}

export function hashEvidenceContent(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function evidenceArtifactPath(id, extension = "txt") {
  return `.seal/evidence/files/${safePathPart(id)}.${safePathPart(extension).replace(/^\.+/, "") || "txt"}`;
}

export function createEvidenceRecord({
  id,
  type,
  claimIds,
  status = "passed",
  sourceKind,
  sourceRefs = [],
  command,
  sourceRef,
  summary,
  artifactPath,
  artifactContent,
  limitations,
  capturedAt = new Date().toISOString(),
  redaction = artifactContent === undefined ? "not_applicable" : "summary_only"
}) {
  if (!id || !type || !Array.isArray(claimIds) || claimIds.length === 0) {
    throw new Error("Evidence records require id, type, and at least one claim id.");
  }
  if (!sourceKind || !allowedSourceKinds.has(sourceKind)) {
    throw new Error(`Evidence source kind must be one of: ${Array.from(allowedSourceKinds).join(", ")}.`);
  }
  if (!limitations) {
    throw new Error("Evidence records require limitations so proof is not treated as absolute.");
  }

  const source = { kind: sourceKind };
  if (command) {
    source.command = command;
  }
  if (sourceRef) {
    source.source_ref = sourceRef;
  }
  if (summary) {
    source.summary = summary;
  }

  const record = {
    id,
    type,
    claim_ids: claimIds,
    status,
    captured_at: capturedAt,
    source,
    limitations,
    redaction
  };

  if (sourceRefs.length > 0) {
    record.source_refs = sourceRefs;
  }

  if (artifactPath) {
    record.artifact_path = artifactPath;
  }

  if (artifactContent !== undefined) {
    record.artifact_hash = hashEvidenceContent(artifactContent);
    record.hash_algorithm = "sha256";
  }

  return record;
}

export async function writeEvidenceArtifact(root, record, content) {
  if (!record.artifact_path) {
    throw new Error(`Evidence ${record.id} has no artifact_path.`);
  }

  const evidenceRoot = path.resolve(root, ".seal", "evidence", "files");
  const artifactPath = path.resolve(root, record.artifact_path);
  if (!artifactPath.startsWith(`${evidenceRoot}${path.sep}`)) {
    throw new Error(`Evidence artifact_path must stay under .seal/evidence/files: ${record.artifact_path}`);
  }

  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, content, "utf8");
  return artifactPath;
}

export async function validateEvidenceHashes(root, evidenceIndex) {
  const errors = [];

  for (const [index, evidence] of (evidenceIndex.evidence ?? []).entries()) {
    if (!evidence.artifact_hash) {
      continue;
    }
    if (evidence.hash_algorithm !== "sha256") {
      errors.push({
        code: "unsupported_hash_algorithm",
        path: `/evidence/${index}/hash_algorithm`,
        message: `Evidence ${evidence.id} must use sha256 for artifact_hash.`
      });
      continue;
    }
    if (!evidence.artifact_path) {
      errors.push({
        code: "missing_artifact_path",
        path: `/evidence/${index}/artifact_path`,
        message: `Evidence ${evidence.id} has a hash but no artifact_path.`
      });
      continue;
    }

    const artifactPath = path.resolve(root, evidence.artifact_path);
    const actualHash = hashEvidenceContent(await readFile(artifactPath, "utf8"));
    if (actualHash !== evidence.artifact_hash) {
      errors.push({
        code: "artifact_hash_mismatch",
        path: `/evidence/${index}/artifact_hash`,
        message: `Evidence ${evidence.id} hash does not match ${evidence.artifact_path}.`
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
