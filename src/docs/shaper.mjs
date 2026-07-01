import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { parseYamlArtifact } from "../artifacts/schema-registry.mjs";
import { stringifyArtifact } from "../artifacts/generate.mjs";
import { CONTRACT_SCHEMA_VERSION, GENERATED_VIEW_NOTICE } from "../contracts/constants.mjs";
import { writeContextPack } from "../context/pack.mjs";

export const DOCS_BEGIN = "<!-- SEAL:DOCS:BEGIN -->";
export const DOCS_END = "<!-- SEAL:DOCS:END -->";
const CLAIM_PATTERN = /<!--\s*seal-claim\s+([^>]*)-->([\s\S]*?)<!--\s*\/seal-claim\s*-->/gi;

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/");
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

async function loadDocsSources(root) {
  const sealRoot = path.join(root, ".seal");
  const [sources, map, trace, proof, debt] = await Promise.all([
    readOptionalArtifact(path.join(sealRoot, "sources.yaml")),
    readOptionalArtifact(path.join(sealRoot, "map.yaml")),
    readOptionalArtifact(path.join(sealRoot, "trace.yaml")),
    readOptionalArtifact(path.join(sealRoot, "proof.yaml")),
    readOptionalArtifact(path.join(sealRoot, "debt.yaml"))
  ]);
  return { sources, map, trace, proof, debt };
}

function mapComponents(map) {
  return asList(map?.components).length > 0 ? asList(map.components) : asList(map?.observed?.components);
}

function mapFiles(map) {
  return asList(map?.files).length > 0 ? asList(map.files) : asList(map?.observed?.files);
}

function mapGaps(map) {
  return [...asList(map?.unknowns), ...asList(map?.gaps)];
}

function firstSentence(value, fallback) {
  const text = String(value ?? "").trim();
  if (!text) {
    return fallback;
  }
  return text.split(/\r?\n/)[0];
}

function sourceRefsFor(...records) {
  return [...new Set(records.flatMap((record) => asList(record?.source_refs)))];
}

function docsSourceRef(sources) {
  return sources?.sources?.[0]?.id ?? "src.docs-shaper";
}

function summarizeComponents(components) {
  if (components.length === 0) {
    return "- No components are mapped yet. Treat architecture prose as a proposal until MAP is populated.";
  }
  return components.slice(0, 8).map((component) => {
    const files = asList(component.files ?? component.source_files);
    const suffix = files.length > 0 ? ` Files: ${files.slice(0, 4).join(", ")}.` : "";
    return `- ${component.id}: ${component.name ?? "component"} - ${firstSentence(component.purpose, "No purpose recorded.")}${suffix}`;
  }).join("\n");
}

function summarizeFiles(files) {
  if (files.length === 0) {
    return "- No files are mapped yet.";
  }
  return files.slice(0, 12).map((file) =>
    `- ${file.path}: ${file.classification ?? "unknown"}; ${firstSentence(file.purpose ?? file.role, "No purpose recorded.")}`
  ).join("\n");
}

function summarizeProof(proof) {
  const claims = asList(proof?.claims);
  if (claims.length === 0) {
    return "- No proof claims are recorded yet.";
  }
  return claims.slice(0, 8).map((claim) => {
    const status = claim.status ?? (asList(claim.gap_refs).length > 0 ? "gapped" : "unknown");
    return `- ${claim.id}: ${status}; ${firstSentence(claim.statement, "No claim statement recorded.")}`;
  }).join("\n");
}

function summarizeDebt(debt, map) {
  const records = [...asList(debt?.records), ...mapGaps(map)];
  if (records.length === 0) {
    return "- No open documentation, proof, or map debt is visible in canonical artifacts.";
  }
  return records.slice(0, 10).map((record) => {
    const id = record.id ?? record.summary ?? "gap";
    const status = record.status ?? "open";
    return `- ${id}: ${status}; ${firstSentence(record.summary ?? record.reason ?? record.missing, "No summary recorded.")}`;
  }).join("\n");
}

function parseAttributes(raw) {
  const attrs = {};
  for (const match of raw.matchAll(/([a-zA-Z0-9_-]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function canonicalIds({ map, proof, debt }) {
  return new Set([
    ...mapComponents(map).map((record) => record.id),
    ...mapFiles(map).flatMap((record) => [record.id, record.path]),
    ...asList(map?.dependencies).map((record) => record.id),
    ...asList(map?.interfaces).map((record) => record.id),
    ...mapGaps(map).map((record) => record.id),
    ...asList(proof?.claims).map((record) => record.id),
    ...asList(proof?.evidence).map((record) => record.id),
    ...asList(proof?.gaps).map((record) => record.id),
    ...asList(debt?.records).map((record) => record.id)
  ].filter(Boolean).map(normalizePath));
}

export function validateDocumentationClaims(markdown, artifacts) {
  const knownIds = canonicalIds(artifacts);
  const claims = [];
  const debtRecords = [];

  for (const match of markdown.matchAll(CLAIM_PATTERN)) {
    const attrs = parseAttributes(match[1]);
    const id = attrs.id || `doc-claim-${claims.length + 1}`;
    const refs = String(attrs.refs ?? "")
      .split(/[,\s]+/)
      .map((item) => normalizePath(item.trim()))
      .filter(Boolean);
    const missingRefs = refs.filter((ref) => !knownIds.has(ref));
    const status = refs.length === 0 ? "untraced" : missingRefs.length > 0 ? "unsupported" : "supported";
    claims.push({
      id,
      refs,
      status,
      missing_refs: missingRefs,
      text: match[2].trim().replace(/\s+/g, " ")
    });
    if (status !== "supported") {
      debtRecords.push({
        id: `debt.doc.${id.replace(/[^a-zA-Z0-9._:-]/g, "-")}`,
        type: refs.length === 0 ? "missing_evidence" : "broken_trace",
        subject: id,
        severity: "warning",
        source_refs: [docsSourceRef(artifacts.sources)],
        blocks: [],
        closure_method: "Link this SEAL-owned documentation claim to MAP, PROVE, evidence, gap, or debt records.",
        status: "open",
        created_by: "seal.docs",
        summary: status === "untraced"
          ? `Documentation claim ${id} has no canonical refs.`
          : `Documentation claim ${id} references unknown canonical ids: ${missingRefs.join(", ")}.`,
        reason: "SEAL-owned generated claim markers must trace to canonical artifacts before being trusted.",
        docs_kind: status,
        file_refs: [],
        authority_state: "inferred",
        approval_state: "pending",
        confidence: 0.7,
        plain_language: "This documentation claim is visible, but SEAL cannot yet trace it to canonical evidence."
      });
    }
  }

  return { claims, debtRecords };
}

export function createHumanDocsProposal(artifacts, options = {}) {
  const components = mapComponents(artifacts.map);
  const files = mapFiles(artifacts.map);
  const sourceRefs = sourceRefsFor(artifacts.map, artifacts.proof, artifacts.debt, artifacts.sources);
  return [
    "# SEAL Documentation Proposal",
    "",
    GENERATED_VIEW_NOTICE,
    "",
    "## README Quick Orientation",
    "",
    `<!-- seal-claim id="doc.quick-orientation" refs="${components[0]?.id ?? ""}" -->`,
    components[0]
      ? `This project currently centers on ${components[0].name ?? components[0].id}.`
      : "This project does not yet have an approved component orientation.",
    "<!-- /seal-claim -->",
    "",
    "## Architecture From MAP And TRACE",
    "",
    summarizeComponents(components),
    "",
    "## Important Files",
    "",
    summarizeFiles(files),
    "",
    "## Testing And Proof",
    "",
    summarizeProof(artifacts.proof),
    "",
    "## Known Gaps And Debt",
    "",
    summarizeDebt(artifacts.debt, artifacts.map),
    "",
    "## Canonical Artifact Links",
    "",
    "- `.seal/map.yaml`",
    "- `.seal/trace.yaml`",
    "- `.seal/proof.yaml`",
    "- `.seal/evidence/index.yaml`",
    "- `.seal/debt.yaml`",
    "- `.seal/context-pack.yaml`",
    "",
    "## Source Authority",
    "",
    sourceRefs.length > 0 ? sourceRefs.map((ref) => `- ${ref}`).join("\n") : "- No source refs were available.",
    "",
    `Generated mode: ${options.mode ?? "human"}`,
    ""
  ].join("\n");
}

export function createAiDocsRecord(artifacts, contextPack) {
  const components = mapComponents(artifacts.map);
  const files = mapFiles(artifacts.map);
  const proofClaims = asList(artifacts.proof?.claims);
  const debtRecords = asList(artifacts.debt?.records);
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    generated_from: [".seal/map.yaml", ".seal/trace.yaml", ".seal/proof.yaml", ".seal/debt.yaml", ".seal/context-pack.yaml"],
    notice: GENERATED_VIEW_NOTICE,
    mode: "ai",
    separation: {
      human_docs: ".seal/reports/docs-proposal.md",
      machine_docs: ".seal/ai-docs/context.yaml",
      rule: "Human prose may link to AI docs, but machine-readable context must remain structured and parseable."
    },
    summary: {
      components: components.length,
      files: files.length,
      proof_claims: proofClaims.length,
      debt_records: debtRecords.length,
      context_target: contextPack?.target ?? "docs"
    },
    records: {
      components: components.map((record) => ({
        id: record.id,
        name: record.name,
        files: asList(record.files ?? record.source_files),
        source_refs: asList(record.source_refs)
      })),
      files: files.map((record) => ({
        path: record.path,
        classification: record.classification,
        component_id: record.component_id ?? record.owner_component_id,
        source_refs: asList(record.source_refs)
      })),
      proof_claims: proofClaims.map((record) => ({
        id: record.id,
        status: record.status ?? "unknown",
        evidence_refs: asList(record.evidence_refs),
        gap_refs: asList(record.gap_refs)
      })),
      gaps_and_debt: [
        ...mapGaps(artifacts.map).map((record) => ({ id: record.id, status: record.status ?? "open", summary: record.summary ?? record.reason })),
        ...debtRecords.map((record) => ({ id: record.id, type: record.type, status: record.status, summary: record.summary }))
      ]
    },
    context_pack_refs: {
      yaml: ".seal/context-pack.yaml",
      json: ".seal/reports/context-pack.json"
    }
  };
}

function mergeDebt(existingDebt, docsDebt, sourceRef) {
  const existingRecords = asList(existingDebt?.records);
  const byId = new Map(existingRecords.map((record) => [record.id, record]));
  for (const record of docsDebt) {
    byId.set(record.id, record);
  }
  return {
    schema_version: existingDebt?.schema_version ?? CONTRACT_SCHEMA_VERSION,
    source_refs: asList(existingDebt?.source_refs).length > 0 ? existingDebt.source_refs : [sourceRef],
    records: [...byId.values()]
  };
}

async function writeBoundedTarget(targetPath, proposal, options = {}) {
  let existing = "";
  try {
    existing = await readFile(targetPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    if (!options.approveTarget) {
      throw new Error("Bounded docs write requires existing generated markers or --approve-target for a new target file.");
    }
  }

  const generatedSection = `${DOCS_BEGIN}\n${proposal.trim()}\n${DOCS_END}\n`;
  const begin = existing.indexOf(DOCS_BEGIN);
  const end = existing.indexOf(DOCS_END);
  if (begin >= 0 && end > begin) {
    const next = `${existing.slice(0, begin)}${generatedSection}${existing.slice(end + DOCS_END.length).replace(/^\r?\n/, "")}`;
    await writeFile(targetPath, next, "utf8");
    return { wrote: true, mode: "bounded-marker" };
  }
  if (!options.approveTarget) {
    throw new Error("Bounded docs write requires SEAL:DOCS markers or --approve-target.");
  }
  const next = existing.trim() ? `${existing.trimEnd()}\n\n${generatedSection}` : generatedSection;
  await writeFile(targetPath, next, "utf8");
  return { wrote: true, mode: "approved-target" };
}

export async function writeHumanDocs(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const artifacts = await loadDocsSources(root);
  const proposal = createHumanDocsProposal(artifacts, { mode: "human" });
  let claimResult = validateDocumentationClaims(proposal, artifacts);
  if (options.target) {
    try {
      const targetText = await readFile(path.resolve(root, options.target), "utf8");
      const selectedResult = validateDocumentationClaims(targetText, artifacts);
      claimResult = {
        claims: [...claimResult.claims, ...selectedResult.claims],
        debtRecords: [...claimResult.debtRecords, ...selectedResult.debtRecords]
      };
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  const sourceRef = docsSourceRef(artifacts.sources);
  const debt = mergeDebt(artifacts.debt, claimResult.debtRecords, sourceRef);
  const outputPath = path.join(root, ".seal", "reports", "docs-proposal.md");
  const debtPath = path.join(root, ".seal", "debt.yaml");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, proposal, "utf8");
  await writeFile(debtPath, stringifyArtifact(debt), "utf8");

  let writeResult = { wrote: false };
  if (options.write) {
    const targetPath = path.resolve(root, options.target ?? "README.md");
    if (!targetPath.startsWith(root)) {
      throw new Error("Docs write target must stay inside the inspected directory.");
    }
    writeResult = await writeBoundedTarget(targetPath, proposal, { approveTarget: options.approveTarget });
  }

  return { proposal, outputPath, debtPath, claims: claimResult.claims, docsDebt: claimResult.debtRecords, writeResult };
}

export async function writeAiDocs(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const artifacts = await loadDocsSources(root);
  const files = mapFiles(artifacts.map);
  const target = options.target ?? files[0]?.path ?? ".";
  const { pack, outputPath: contextPackPath, reportPath } = await writeContextPack(root, {
    target,
    summary: `Build AI docs context for ${target}.`
  });
  const refreshed = await loadDocsSources(root);
  const aiDocs = createAiDocsRecord(refreshed, pack);
  const outputPath = path.join(root, ".seal", "ai-docs", "context.yaml");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, YAML.stringify(aiDocs, { aliasDuplicateObjects: false, lineWidth: 0 }), "utf8");
  return { aiDocs, outputPath, contextPackPath, reportPath };
}
