import { appendFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { stringifyArtifact } from "./generate.mjs";
import { parseYamlArtifact, validateArtifact } from "./schema-registry.mjs";

export const ARTIFACT_WRITE_AUDIT_PATH = ".seal/audit/artifact-writes.jsonl";

const canonicalArtifacts = Object.freeze({
  sources: { path: ".seal/sources.yaml", required: false },
  ontology: { path: ".seal/ontology.yaml", required: true },
  plan: { path: ".seal/plan.yaml", required: false },
  map: { path: ".seal/map.yaml", required: true },
  trace: { path: ".seal/trace.yaml", required: false },
  debt: { path: ".seal/debt.yaml", required: false },
  proof: { path: ".seal/proof.yaml", required: true },
  evidenceIndex: { path: ".seal/evidence/index.yaml", required: true },
  contextPack: { path: ".seal/context-pack.yaml", required: false },
  impact: {
    directory: ".seal/impacts",
    pattern: /^IMPACT-.+\.ya?ml$/,
    fileName: (artifact) => `${artifact?.id ?? "IMPACT"}.yaml`,
    required: false,
    repeated: true
  },
  fly: {
    directory: ".seal/fly",
    pattern: /^FLY-.+\.ya?ml$/,
    fileName: (artifact) => `${artifact?.id ?? "FLY"}.yaml`,
    required: false,
    repeated: true
  }
});

const derivedArtifacts = Object.freeze({
  artifactIndex: { path: ".seal/index.yaml" },
  migration: { path: ".seal/migrations/MIGRATION-v2-initial.md" },
  gapReview: { path: ".seal/reports/gap-review.md" },
  proofGaps: { path: ".seal/reports/proof-gaps.md" },
  launchReadiness: { path: ".seal/reports/launch-readiness.md" },
  contextPackJson: { path: ".seal/reports/context-pack.json" },
  docsProposal: { path: ".seal/reports/docs-proposal.md" },
  aiDocsContext: { path: ".seal/ai-docs/context.yaml" },
  dashboard: { path: ".seal/views/dashboard.md" },
  repoMap: { path: ".seal/views/repo-map.md" },
  systemMap: { path: ".seal/views/system-map.mmd" },
  componentGraph: { path: ".seal/views/component-graph.mmd" },
  interfaceDataFlow: { path: ".seal/views/interface-data-flow.mmd" },
  traceability: { path: ".seal/views/traceability.mmd" },
  proofEvidence: { path: ".seal/views/proof-evidence.mmd" },
  readinessBlockers: { path: ".seal/views/readiness-blockers.mmd" },
  mermaidNavigation: { path: ".seal/views/mermaid-navigation.md" },
  debtView: { path: ".seal/views/debt.md" },
  legacyMapMarkdown: { path: ".seal/reports/map.md" },
  legacyMapMermaid: { path: ".seal/reports/map.mmd" }
});

export const ARTIFACT_LAYOUT = Object.freeze({
  canonical: canonicalArtifacts,
  derived: derivedArtifacts
});

function toPosix(value) {
  return String(value).replaceAll("\\", "/");
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

function validationMessage(result) {
  return result.errors.map((error) => `${error.path} ${error.message}`).join("; ");
}

export class ArtifactStore {
  constructor(rootPath, { now = () => new Date().toISOString() } = {}) {
    this.root = path.resolve(rootPath);
    this.now = now;
  }

  pathFor(key, artifact) {
    const canonicalSpec = canonicalArtifacts[key];
    if (canonicalSpec?.repeated) {
      return path.join(this.root, canonicalSpec.directory, canonicalSpec.fileName(artifact));
    }
    if (canonicalSpec) {
      return path.join(this.root, canonicalSpec.path);
    }
    const derivedSpec = derivedArtifacts[key];
    if (derivedSpec) {
      return path.join(this.root, derivedSpec.path);
    }
    throw new Error(`Unknown SEAL artifact key: ${key}`);
  }

  relativePathFor(key, artifact) {
    return toPosix(path.relative(this.root, this.pathFor(key, artifact)));
  }

  async listCanonical(key) {
    const spec = canonicalArtifacts[key];
    if (!spec?.repeated) {
      throw new Error(`${key} is not a repeated canonical artifact.`);
    }
    const directoryPath = path.join(this.root, spec.directory);
    try {
      const entries = await readdir(directoryPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && spec.pattern.test(entry.name))
        .map((entry) => path.join(directoryPath, entry.name))
        .sort();
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async readCanonical(key, options = {}) {
    const spec = canonicalArtifacts[key];
    if (!spec || spec.repeated) {
      throw new Error(`${key} is not a single canonical artifact.`);
    }
    const {
      required = spec.required,
      validate = false,
      mode = required ? "fail-fast" : "diagnostic"
    } = options;
    const filePath = this.pathFor(key);
    try {
      const artifact = await parseYamlArtifact(filePath);
      const diagnostics = [];
      if (validate) {
        const result = await validateArtifact(key, artifact);
        if (!result.valid) {
          diagnostics.push({
            file: filePath,
            artifactType: key,
            severity: mode === "fail-fast" ? "error" : "warning",
            message: `${key} artifact is invalid: ${validationMessage(result)}`,
            errors: result.errors
          });
        }
      }
      if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        throw new Error(diagnostics.map((diagnostic) => diagnostic.message).join("; "));
      }
      return { artifact, filePath, diagnostics };
    } catch (error) {
      if (error.code === "ENOENT" && !required) {
        return {
          artifact: undefined,
          filePath,
          diagnostics: [{
            file: filePath,
            artifactType: key,
            severity: "info",
            message: `${key} artifact is optional and missing.`
          }]
        };
      }
      if (mode === "diagnostic") {
        return {
          artifact: undefined,
          filePath,
          diagnostics: [{
            file: filePath,
            artifactType: key,
            severity: required ? "error" : "warning",
            message: error.code === "ENOENT" ? `${key} artifact is required.` : error.message
          }]
        };
      }
      throw error;
    }
  }

  async readCanonicalSet(options = {}) {
    const {
      required = false,
      validate = false,
      mode = "diagnostic"
    } = options;
    const artifactSet = {};
    const diagnostics = [];
    const singleKeys = Object.keys(canonicalArtifacts).filter((key) => !canonicalArtifacts[key].repeated);
    for (const key of singleKeys) {
      const result = await this.readCanonical(key, {
        required: required ? canonicalArtifacts[key].required : false,
        validate,
        mode
      });
      artifactSet[key] = result.artifact;
      diagnostics.push(...result.diagnostics);
    }

    artifactSet.impacts = [];
    for (const filePath of await this.listCanonical("impact")) {
      const result = await this.readCanonicalFile("impact", filePath, { validate, mode });
      if (result.artifact) artifactSet.impacts.push(result.artifact);
      diagnostics.push(...result.diagnostics);
    }

    artifactSet.flyRecords = [];
    for (const filePath of await this.listCanonical("fly")) {
      const result = await this.readCanonicalFile("fly", filePath, { validate, mode });
      if (result.artifact) artifactSet.flyRecords.push(result.artifact);
      diagnostics.push(...result.diagnostics);
    }

    return { artifactSet, diagnostics };
  }

  async readCanonicalFile(artifactType, filePath, options = {}) {
    const { validate = false, mode = "diagnostic" } = options;
    try {
      const artifact = await parseYamlArtifact(filePath);
      const diagnostics = [];
      if (validate) {
        const result = await validateArtifact(artifactType, artifact);
        if (!result.valid) {
          diagnostics.push({
            file: filePath,
            artifactType,
            severity: mode === "fail-fast" ? "error" : "warning",
            message: `${artifactType} artifact is invalid: ${validationMessage(result)}`,
            errors: result.errors
          });
        }
      }
      if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        throw new Error(diagnostics.map((diagnostic) => diagnostic.message).join("; "));
      }
      return { artifact, filePath, diagnostics };
    } catch (error) {
      if (mode === "diagnostic") {
        return {
          artifact: undefined,
          filePath,
          diagnostics: [{
            file: filePath,
            artifactType,
            severity: "warning",
            message: error.message
          }]
        };
      }
      throw error;
    }
  }

  async writeCanonical(key, artifact, options = {}) {
    const { overwrite = false, reason = "write_canonical" } = options;
    const filePath = this.pathFor(key, artifact);
    const exists = await fileExists(filePath);
    if (exists && !overwrite) {
      await this.audit({ key, kind: "canonical", action: "preserved", filePath, reason, overwrite });
      return { filePath, written: false, preserved: true };
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, stringifyArtifact(artifact), "utf8");
    await this.audit({ key, kind: "canonical", action: exists ? "overwritten" : "created", filePath, reason, overwrite });
    return { filePath, written: true, preserved: false };
  }

  async writeDerived(key, content, options = {}) {
    const { reason = "write_derived" } = options;
    const filePath = this.pathFor(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
    await this.audit({ key, kind: "derived", action: "overwritten", filePath, reason, overwrite: true });
    return { filePath, written: true, preserved: false };
  }

  async audit({ key, kind, action, filePath, reason, overwrite }) {
    const auditPath = path.join(this.root, ARTIFACT_WRITE_AUDIT_PATH);
    await mkdir(path.dirname(auditPath), { recursive: true });
    const record = {
      at: this.now(),
      artifact_key: key,
      kind,
      action,
      path: toPosix(path.relative(this.root, filePath)),
      reason,
      overwrite
    };
    await appendFile(auditPath, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }
}

export function createArtifactStore(rootPath, options = {}) {
  return new ArtifactStore(rootPath, options);
}
