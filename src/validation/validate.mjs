import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { validateAuthority } from "../artifacts/authority.mjs";
import { validateArtifactReferences } from "../artifacts/reference-integrity.mjs";
import { artifactSchemas, parseYamlArtifact, validateArtifact } from "../artifacts/schema-registry.mjs";
import { evaluateArtifactVersion } from "../artifacts/versions.mjs";
import { validateFileCoverage } from "./file-coverage.mjs";

const artifactSpecs = Object.freeze({
  ontology: {
    label: "ONTOLOGY",
    required: true,
    pattern: ".seal/ontology.yaml",
    discover: async (root) => [path.join(root, ".seal", "ontology.yaml")]
  },
  map: {
    label: "MAP",
    required: true,
    pattern: ".seal/map.yaml",
    discover: async (root) => [path.join(root, ".seal", "map.yaml")]
  },
  impact: {
    label: "IMPACT",
    required: false,
    pattern: ".seal/impacts/IMPACT-*.yaml",
    discover: async (root) => {
      const impactDir = path.join(root, ".seal", "impacts");
      try {
        const entries = await readdir(impactDir, { withFileTypes: true });
        return entries
          .filter((entry) => entry.isFile() && /^IMPACT-.+\.ya?ml$/.test(entry.name))
          .map((entry) => path.join(impactDir, entry.name))
          .sort();
      } catch (error) {
        if (error.code === "ENOENT") {
          return [];
        }
        throw error;
      }
    }
  },
  proof: {
    label: "PROOF",
    required: true,
    pattern: ".seal/proof.yaml",
    discover: async (root) => [path.join(root, ".seal", "proof.yaml")]
  },
  evidenceIndex: {
    label: "evidence index",
    required: true,
    pattern: ".seal/evidence/index.yaml",
    discover: async (root) => [path.join(root, ".seal", "evidence", "index.yaml")]
  },
  debt: {
    label: "visible debt register",
    required: false,
    pattern: ".seal/debt.yaml",
    discover: async (root) => [path.join(root, ".seal", "debt.yaml")]
  }
});

function normalizePointer(pointer) {
  return pointer || "/";
}

function readAtPointer(value, pointer) {
  if (!pointer || pointer === "/") {
    return value;
  }

  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((current, key) => {
      if (current === undefined || current === null) {
        return undefined;
      }
      return current[key];
    }, value);
}

function describeValue(value) {
  if (value === undefined) {
    return "missing";
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  if (typeof value === "object") {
    return `object(${Object.keys(value).join(", ") || "empty"})`;
  }
  return `${typeof value}(${JSON.stringify(value)})`;
}

function expectedShape(error) {
  if (error.keyword === "required") {
    return `required property "${error.params.missingProperty}"`;
  }
  if (error.keyword === "type") {
    return error.params.type;
  }
  if (error.keyword === "enum") {
    return `one of: ${error.params.allowedValues.join(", ")}`;
  }
  if (error.keyword === "pattern") {
    return `match pattern ${error.params.pattern}`;
  }
  if (error.keyword === "minItems") {
    return `at least ${error.params.limit} item(s)`;
  }
  if (error.keyword === "minLength") {
    return `at least ${error.params.limit} character(s)`;
  }
  if (error.keyword === "additionalProperties") {
    return `remove unsupported property "${error.params.additionalProperty}"`;
  }
  if (error.keyword === "anyOf") {
    return "at least one evidence_refs or gap_refs entry";
  }
  return error.message ?? "schema-compatible value";
}

function suggestedFix(error) {
  if (error.keyword === "required") {
    return `Add "${error.params.missingProperty}" at this object and fill it from an explicit source authority.`;
  }
  if (error.keyword === "type") {
    return `Change the value to ${error.params.type}.`;
  }
  if (error.keyword === "enum") {
    return `Use one of the allowed values: ${error.params.allowedValues.join(", ")}.`;
  }
  if (error.keyword === "pattern") {
    return "Rename the value to match the documented SEAL id/path pattern.";
  }
  if (error.keyword === "minItems") {
    return "Add a real referenced item, or record the missing knowledge as a visible gap.";
  }
  if (error.keyword === "minLength") {
    return "Provide a non-empty explanation tied to the artifact source.";
  }
  if (error.keyword === "additionalProperties") {
    return `Remove "${error.params.additionalProperty}" or add schema support before relying on it.`;
  }
  if (error.keyword === "anyOf") {
    return "Attach evidence_refs when proven, or gap_refs when proof is still missing.";
  }
  return "Inspect this artifact field and make the SEAL source, evidence, or gap explicit.";
}

function diagnosticFromAjvError(filePath, artifactType, artifact, error) {
  const pathForError = error.keyword === "required"
    ? `${normalizePointer(error.instancePath)}/${error.params.missingProperty}`.replace("//", "/")
    : normalizePointer(error.instancePath);
  const actualPointer = error.keyword === "required" ? pathForError : error.instancePath;

  return {
    file: filePath,
    artifactType,
    path: pathForError,
    expected: expectedShape(error),
    actual: describeValue(readAtPointer(artifact, actualPointer)),
    fix: suggestedFix(error),
    message: error.message ?? "schema validation failed"
  };
}

function diagnosticFromVersionError(filePath, artifactType, error) {
  return {
    file: filePath,
    artifactType,
    path: error.path,
    expected: error.expected,
    actual: error.actual,
    fix: error.fix,
    message: error.message
  };
}

function fileForAuthorityPath(authorityPath, artifactFiles) {
  if (authorityPath.startsWith("/ontology/")) {
    return artifactFiles.ontology;
  }
  if (authorityPath.startsWith("/map/")) {
    return artifactFiles.map;
  }
  if (authorityPath.startsWith("/proof/")) {
    return artifactFiles.proof;
  }
  if (authorityPath.startsWith("/evidenceIndex/")) {
    return artifactFiles.evidenceIndex;
  }
  if (authorityPath.startsWith("/debt/")) {
    return artifactFiles.debt;
  }
  const impactMatch = authorityPath.match(/^\/impacts\/(\d+)\//);
  if (impactMatch) {
    return artifactFiles.impacts[Number(impactMatch[1])] ?? artifactFiles.map;
  }
  return artifactFiles.map;
}

function diagnosticFromAuthorityError(error, artifactFiles) {
  return {
    file: fileForAuthorityPath(error.path, artifactFiles),
    artifactType: "authority",
    path: error.path,
    expected: "approved records backed by human_approved, repo_observed, externally_sourced, execution_evidence, or mathematically_proven authority",
    actual: "approved record backed by inferred or unknown authority",
    fix: "Downgrade approval_state, attach stronger source authority, or record the uncertainty as a visible gap.",
    message: error.message
  };
}

function fileForReferencePath(referencePath, artifactFiles) {
  if (referencePath.startsWith("/ontology/")) {
    return artifactFiles.ontology;
  }
  if (referencePath.startsWith("/map/")) {
    return artifactFiles.map;
  }
  if (referencePath.startsWith("/proof/")) {
    return artifactFiles.proof;
  }
  if (referencePath.startsWith("/evidenceIndex/")) {
    return artifactFiles.evidenceIndex;
  }
  if (referencePath.startsWith("/debt/")) {
    return artifactFiles.debt;
  }
  const impactMatch = referencePath.match(/^\/impacts\/(\d+)\//);
  if (impactMatch) {
    return artifactFiles.impacts[Number(impactMatch[1])] ?? artifactFiles.map;
  }
  return artifactFiles.map;
}

function diagnosticFromReferenceError(error, artifactFiles) {
  const expectedByCode = {
    duplicate_id: "globally unique SEAL id",
    dangling_ref: "reference to an existing SEAL id of the required type",
    invalid_link_type: "supported P0 relationship or an explicit visible gap"
  };

  const fixByCode = {
    duplicate_id: "Rename one record to a stable unique id before relying on traceability.",
    dangling_ref: "Create the referenced record, correct the id, or record the missing knowledge as a visible gap.",
    invalid_link_type: "Use a supported target kind or model the uncertainty as a gap until the artifact model supports it."
  };

  return {
    file: fileForReferencePath(error.path, artifactFiles),
    artifactType: "reference",
    path: error.path,
    expected: expectedByCode[error.code] ?? "valid cross-artifact reference",
    actual: error.code,
    fix: fixByCode[error.code] ?? "Inspect this link and make its source, target, or gap explicit.",
    message: error.message
  };
}

function diagnosticFromCoverageError(error, artifactFiles) {
  const artifactFile = error.code === "orphan_component" && artifactFiles.debt
    ? artifactFiles.debt
    : artifactFiles.map;

  return {
    file: artifactFile,
    artifactType: "coverage",
    path: error.path,
    expected: error.expected,
    actual: error.actual ?? error.code,
    fix: error.fix,
    message: error.message
  };
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

export async function discoverSealArtifacts(rootPath) {
  const root = path.resolve(rootPath);
  const discovered = [];
  const missing = [];

  for (const [artifactType, spec] of Object.entries(artifactSpecs)) {
    const files = await spec.discover(root);
    const existingFiles = [];
    for (const filePath of files) {
      if (await fileExists(filePath)) {
        existingFiles.push(filePath);
      }
    }

    if (spec.required && existingFiles.length === 0) {
      missing.push({
        file: path.join(root, artifactSchemas[artifactType].artifactPath.replace("*", "<id>")),
        artifactType,
        path: "/",
        expected: spec.pattern,
        actual: "missing",
        fix: `Create ${spec.pattern} before validating the SEAL artifact set.`,
        message: `${spec.label} artifact is required.`
      });
    }

    for (const filePath of existingFiles) {
      discovered.push({ artifactType, filePath });
    }
  }

  return { root, artifacts: discovered, missing };
}

export async function validateSealArtifacts(rootPath) {
  const { root, artifacts, missing } = await discoverSealArtifacts(rootPath);
  const diagnostics = [...missing];
  const validated = [];
  const artifactSet = { impacts: [] };
  const artifactFiles = { impacts: [] };

  for (const artifact of artifacts) {
    try {
      const parsed = await parseYamlArtifact(artifact.filePath);
      const versionResult = evaluateArtifactVersion(artifact.artifactType, parsed);
      const result = await validateArtifact(artifact.artifactType, parsed);
      if (artifact.artifactType === "impact") {
        artifactSet.impacts.push(parsed);
        artifactFiles.impacts.push(artifact.filePath);
      } else {
        artifactSet[artifact.artifactType] = parsed;
        artifactFiles[artifact.artifactType] = artifact.filePath;
      }
      validated.push({
        artifactType: artifact.artifactType,
        file: artifact.filePath,
        valid: result.valid && versionResult.valid
      });

      for (const error of versionResult.diagnostics) {
        diagnostics.push(diagnosticFromVersionError(artifact.filePath, artifact.artifactType, error));
      }

      for (const error of result.rawErrors ?? []) {
        diagnostics.push(diagnosticFromAjvError(artifact.filePath, artifact.artifactType, parsed, error));
      }
    } catch (error) {
      diagnostics.push({
        file: artifact.filePath,
        artifactType: artifact.artifactType,
        path: "/",
        expected: "parseable YAML artifact",
        actual: "parse error",
        fix: "Fix YAML syntax before schema validation can inspect this artifact.",
        message: error.message
      });
    }
  }

  if (diagnostics.length === 0) {
    const referenceResult = validateArtifactReferences(artifactSet);
    for (const error of referenceResult.errors) {
      diagnostics.push(diagnosticFromReferenceError(error, artifactFiles));
    }
  }

  if (diagnostics.length === 0) {
    const coverageResult = await validateFileCoverage(root, artifactSet);
    for (const error of coverageResult.errors) {
      diagnostics.push(diagnosticFromCoverageError(error, artifactFiles));
    }
  }

  if (diagnostics.length === 0) {
    const authorityResult = validateAuthority(artifactSet);
    for (const error of authorityResult.errors) {
      diagnostics.push(diagnosticFromAuthorityError(error, artifactFiles));
    }
  }

  return {
    root,
    valid: diagnostics.length === 0,
    validated,
    diagnostics
  };
}

export function formatValidationReport(result) {
  if (result.valid) {
    return [
      `SEAL validation passed for ${result.root}.`,
      `Validated ${result.validated.length} artifact file(s).`
    ].join("\n");
  }

  const lines = [
    `SEAL validation failed for ${result.root}.`,
    `${result.diagnostics.length} issue(s) found.`
  ];

  result.diagnostics.forEach((diagnostic, index) => {
    lines.push("");
    lines.push(`${index + 1}. ${path.relative(result.root, diagnostic.file).replaceAll(path.sep, "/")}`);
    lines.push(`   path: ${diagnostic.path}`);
    lines.push(`   expected: ${diagnostic.expected}`);
    lines.push(`   actual: ${diagnostic.actual}`);
    lines.push(`   fix: ${diagnostic.fix}`);
    lines.push(`   detail: ${diagnostic.message}`);
  });

  return lines.join("\n");
}
