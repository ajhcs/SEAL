import { CONTRACT_SCHEMA_VERSION } from "../contracts/constants.mjs";

export const CURRENT_ARTIFACT_SCHEMA_VERSION = CONTRACT_SCHEMA_VERSION;

export const SUPPORTED_ARTIFACT_SCHEMA_VERSIONS = Object.freeze([
  CURRENT_ARTIFACT_SCHEMA_VERSION
]);

export const NO_OP_MIGRATION_SOURCE_VERSIONS = Object.freeze([
  "0.0.0"
]);

export const MIGRATION_POLICY_DOC = "plugin/docs/migration-policy.md";

function parseVersion(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }

  return match.slice(1).map((part) => Number(part));
}

function compareVersions(left, right) {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);

  if (!parsedLeft || !parsedRight) {
    return null;
  }

  for (let index = 0; index < parsedLeft.length; index += 1) {
    if (parsedLeft[index] < parsedRight[index]) {
      return -1;
    }
    if (parsedLeft[index] > parsedRight[index]) {
      return 1;
    }
  }

  return 0;
}

function versionDiagnostic({ artifactType, actual, fix, message }) {
  return {
    path: "/schema_version",
    expected: `schema_version ${CURRENT_ARTIFACT_SCHEMA_VERSION}`,
    actual,
    fix,
    message: `${artifactType} ${message}`
  };
}

export function evaluateArtifactVersion(artifactType, artifact) {
  const schemaVersion = artifact?.schema_version;

  if (schemaVersion === undefined) {
    return { valid: true, diagnostics: [] };
  }

  if (!parseVersion(schemaVersion)) {
    return {
      valid: false,
      diagnostics: [
        versionDiagnostic({
          artifactType,
          actual: String(schemaVersion),
          fix: `Use a semantic x.y.z schema_version before applying migrations; see ${MIGRATION_POLICY_DOC}.`,
          message: "schema_version must use semantic x.y.z so SEAL can choose a migration path."
        })
      ]
    };
  }

  if (SUPPORTED_ARTIFACT_SCHEMA_VERSIONS.includes(schemaVersion)) {
    return { valid: true, diagnostics: [] };
  }

  const comparison = compareVersions(schemaVersion, CURRENT_ARTIFACT_SCHEMA_VERSION);
  if (comparison === -1) {
    const fix = NO_OP_MIGRATION_SOURCE_VERSIONS.includes(schemaVersion)
      ? `Review this artifact against the current schema, then update schema_version to ${CURRENT_ARTIFACT_SCHEMA_VERSION}; see ${MIGRATION_POLICY_DOC}.`
      : `Add or run a migration from ${schemaVersion} to ${CURRENT_ARTIFACT_SCHEMA_VERSION}; see ${MIGRATION_POLICY_DOC}.`;

    return {
      valid: false,
      diagnostics: [
        versionDiagnostic({
          artifactType,
          actual: schemaVersion,
          fix,
          message: `schema_version ${schemaVersion} is older than supported ${CURRENT_ARTIFACT_SCHEMA_VERSION}.`
        })
      ]
    };
  }

  return {
    valid: false,
    diagnostics: [
      versionDiagnostic({
        artifactType,
        actual: schemaVersion,
        fix: `Upgrade SEAL before editing this artifact; this build only supports ${CURRENT_ARTIFACT_SCHEMA_VERSION}. See ${MIGRATION_POLICY_DOC}.`,
        message: `schema_version ${schemaVersion} is newer than this SEAL build supports.`
      })
    ]
  };
}
