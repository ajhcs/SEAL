import { createHash } from "node:crypto";
import { appendFile, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertGeneratedArtifactsValid,
  createContextPackArtifact,
  createEvidenceIndex,
  createFlyArtifact,
  createImpactArtifact,
  createPlanArtifact,
  createProofArtifact,
  createSourceRecord,
  createSourcesArtifact,
  createTraceArtifact,
  stringifyArtifact
} from "../artifacts/generate.mjs";
import { writeArtifactIndex } from "../artifacts/index.mjs";
import { createDebtRegisterFromMap } from "../debt/register.mjs";
import { writeIngestionGapReview } from "../ingestion/gap-review.mjs";
import { ingestMarkdownPlan } from "../ingestion/markdown-plan.mjs";
import { createRepoMap } from "../inventory/map-repo.mjs";

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function idPart(value) {
  const cleaned = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "target";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractHeading(markdown, fallback) {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallback;
}

function sourceRecordsFromMap(map) {
  if (asArray(map.sources).length > 0) {
    return map.sources;
  }
  const sourceRefs = new Set();
  for (const collection of [map.components, map.files, map.dependencies, map.interfaces, map.data_stores, map.tests, map.unknowns]) {
    for (const record of asArray(collection)) {
      for (const sourceRef of asArray(record?.source_refs)) {
        sourceRefs.add(sourceRef);
      }
    }
  }
  return [...sourceRefs].map((sourceId) => createSourceRecord({ sourceId }));
}

function dedupeById(records) {
  const byId = new Map();
  for (const record of records.filter(Boolean)) {
    if (record.id && !byId.has(record.id)) {
      byId.set(record.id, record);
    }
  }
  return [...byId.values()];
}

function createPlanReviewGap(sourceId) {
  return {
    id: "gap.plan-human-review",
    summary: "Extracted plan facts need human review before they become approved baseline authority.",
    reason: "Markdown plan ingestion is heuristic, so SEAL keeps extracted requirements, risks, assumptions, trace links, and gates inferred until reviewed.",
    source_refs: [sourceId],
    authority_state: "inferred",
    approval_state: "not_required",
    confidence: 0.8,
    status: "open",
    plain_language: "SEAL found plan facts, but a person still needs to review them before they become approved contract facts.",
    next_step: "Review the extracted plan records, approve the valid ones, and keep any uncertain items as explicit gaps."
  };
}

function mergeMarkdownPlanIntoMap(map, planCollections, planSourceRecord, relativePlanPath) {
  map.sources = dedupeById([planSourceRecord, ...asArray(map.sources)]);
  map.requirements = dedupeById([...asArray(map.requirements), ...asArray(planCollections.requirements)]);
  map.risks = dedupeById([...asArray(map.risks), ...asArray(planCollections.risks)]);
  map.assumptions = dedupeById([...asArray(map.assumptions), ...asArray(planCollections.assumptions)]);
  map.trace_links = dedupeById([...asArray(map.trace_links), ...asArray(planCollections.trace_links)]);
  map.launch_gates = dedupeById([...asArray(map.launch_gates), ...asArray(planCollections.launch_gates)]);
  map.gaps = dedupeById([
    ...asArray(map.gaps),
    createPlanReviewGap(planSourceRecord.id),
    ...asArray(planCollections.gaps)
  ]);

  for (const file of asArray(map.files)) {
    if (file.path === relativePlanPath) {
      file.source_refs = [...new Set([...asArray(file.source_refs), planSourceRecord.id])];
    }
  }
}

function firstComponentId(map) {
  const first = asArray(map.components)[0] ?? asArray(map.observed?.components)[0];
  if (typeof first === "string") {
    return first;
  }
  return first?.id;
}

function firstMappedFile(map) {
  return asArray(map.files)[0]?.path ?? "README.md";
}

function firstServiceGapId(map) {
  const directGap = asArray(map.services?.gaps)[0];
  if (directGap) {
    return directGap;
  }
  return asArray(map.unknowns).find((unknown) => /service|cost/i.test(`${unknown.id} ${unknown.summary ?? ""}`))?.id
    ?? "gap.generated-service-cost-discovery";
}

async function createPlanFromFile(targetPath, outputRoot, sourceId, componentId) {
  const markdown = await readFile(targetPath, "utf8");
  const relativePlanPath = toPosix(path.relative(outputRoot, targetPath));
  const objective = extractHeading(markdown, path.basename(targetPath, path.extname(targetPath)));
  const plan = createPlanArtifact({
    sourceId,
    planId: `PLAN-${idPart(path.basename(targetPath, path.extname(targetPath)))}`,
    componentId,
    objectiveSummary: objective,
    userSummary: "User or team named by the supplied plan, pending review.",
    painSummary: "Supplied plan needs executable engineering baseline, proof obligations, and authority gaps.",
    status: "draft"
  });

  plan.baseline.applies_to = [relativePlanPath];
  plan.scope.push({
    id: `SCOPE-${idPart(relativePlanPath)}`,
    summary: `Ingested source plan ${relativePlanPath}.`,
    source_refs: [sourceId],
    trace_refs: [],
    authority_state: "human_approved",
    approval_state: "pending",
    confidence: 0.8
  });

  return plan;
}

function createPlanForRepo(targetPath, sourceId, componentId) {
  const targetName = path.basename(targetPath) || "workspace";
  return createPlanArtifact({
    sourceId,
    planId: `PLAN-${idPart(targetName)}`,
    componentId,
    objectiveSummary: `Understand and govern ${targetName} before code changes.`,
    userSummary: "Repository owner and future maintainers.",
    painSummary: "Repo changes need visible plans, impact, proof, debt, and learning artifacts.",
    status: "draft"
  });
}

export const ARTIFACT_WRITE_POLICIES = Object.freeze({
  CREATE_MISSING: "create-missing",
  REPLACE_WITH_BACKUP: "replace-with-backup",
  STRICT_INIT: "strict-init"
});

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

async function fileSha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function backupRootFor(outputRoot) {
  const timestamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
  return path.join(outputRoot, ".seal", "backups", timestamp);
}

function auditPathFor(outputRoot) {
  return path.join(outputRoot, ".seal", "audit", "artifact-writes.jsonl");
}

async function appendArtifactWriteAudit(outputRoot, entry) {
  const auditPath = auditPathFor(outputRoot);
  await mkdir(path.dirname(auditPath), { recursive: true });
  await appendFile(auditPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function artifactTypeFor(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

async function writeManagedArtifact(filePath, content, { outputRoot, writePolicy, backupRoot, artifactKey }) {
  const exists = await fileExists(filePath);
  if (exists && writePolicy === ARTIFACT_WRITE_POLICIES.CREATE_MISSING) {
    return { path: filePath, action: "preserved" };
  }

  if (exists && writePolicy === ARTIFACT_WRITE_POLICIES.STRICT_INIT) {
    throw new Error(`SEAL artifact already exists at ${filePath}; strict-init refuses to overwrite canonical artifacts.`);
  }

  if (exists && writePolicy === ARTIFACT_WRITE_POLICIES.REPLACE_WITH_BACKUP) {
    const relativePath = path.relative(outputRoot, filePath);
    const backupPath = path.join(backupRoot, relativePath);
    const previousSha256 = await fileSha256(filePath);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await copyFile(filePath, backupPath);
    await writeFile(filePath, content, "utf8");
    const newSha256 = await fileSha256(filePath);
    await appendArtifactWriteAudit(outputRoot, {
      timestamp: new Date().toISOString(),
      action: "replaced_with_backup",
      write_policy: writePolicy,
      artifact_path: toPosix(relativePath),
      backup_path: toPosix(path.relative(outputRoot, backupPath)),
      artifact_key: artifactKey ?? null,
      artifact_type: artifactTypeFor(filePath),
      previous_sha256: previousSha256,
      new_sha256: newSha256,
      context: {
        output_root: path.resolve(outputRoot),
        cwd: process.cwd()
      }
    });
    return { path: filePath, action: "replaced_with_backup", backupPath };
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return { path: filePath, action: "created" };
}

async function writeGeneratedArtifact(filePath, content) {
  const exists = await fileExists(filePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return { path: filePath, action: exists ? "refreshed" : "created" };
}

async function writeArtifactSet(outputRoot, artifactSet, options = {}) {
  const writePolicy = options.writePolicy ?? ARTIFACT_WRITE_POLICIES.REPLACE_WITH_BACKUP;
  const sealRoot = path.join(outputRoot, ".seal");
  const impactRoot = path.join(sealRoot, "impacts");
  const evidenceRoot = path.join(sealRoot, "evidence");
  const flyRoot = path.join(sealRoot, "fly");
  const migrationsRoot = path.join(sealRoot, "migrations");
  await mkdir(impactRoot, { recursive: true });
  await mkdir(evidenceRoot, { recursive: true });
  await mkdir(flyRoot, { recursive: true });
  await mkdir(migrationsRoot, { recursive: true });

  const written = {
    sources: path.join(sealRoot, "sources.yaml"),
    plan: path.join(sealRoot, "plan.yaml"),
    map: path.join(sealRoot, "map.yaml"),
    trace: path.join(sealRoot, "trace.yaml"),
    debt: path.join(sealRoot, "debt.yaml"),
    impact: path.join(impactRoot, "IMPACT-initial.yaml"),
    proof: path.join(sealRoot, "proof.yaml"),
    evidenceIndex: path.join(evidenceRoot, "index.yaml"),
    fly: path.join(flyRoot, "FLY-generated.yaml"),
    contextPack: path.join(sealRoot, "context-pack.yaml"),
    migration: path.join(migrationsRoot, "MIGRATION-v2-initial.md")
  };

  const backupRoot = backupRootFor(outputRoot);
  const writeActions = {};
  const generatedArtifactKeys = new Set(["fly", "contextPack"]);
  const artifactsToWrite = [
    ["sources", artifactSet.sources],
    ["plan", artifactSet.plan],
    ["map", artifactSet.map],
    ["trace", artifactSet.trace],
    ["debt", artifactSet.debt],
    ["impact", artifactSet.impact],
    ["proof", artifactSet.proof],
    ["evidenceIndex", artifactSet.evidenceIndex],
    ["fly", artifactSet.fly],
    ["contextPack", artifactSet.contextPack]
  ];

  for (const [key, artifact] of artifactsToWrite) {
    if (writePolicy === ARTIFACT_WRITE_POLICIES.CREATE_MISSING && generatedArtifactKeys.has(key)) {
      writeActions[key] = await writeGeneratedArtifact(written[key], stringifyArtifact(artifact));
      continue;
    }
    writeActions[key] = await writeManagedArtifact(written[key], stringifyArtifact(artifact), {
      outputRoot,
      writePolicy,
      backupRoot,
      artifactKey: key
    });
  }

  writeActions.migration = await writeManagedArtifact(
    written.migration,
    [
      "# SEAL v2 Migration",
      "",
      "Generated during initial v2 artifact creation.",
      "",
      "- Existing artifacts should be backed up before destructive migration.",
      "- Fields that cannot be proven from prior data are represented as explicit gaps, unknowns, debt, or inferred source authority.",
      "- Authoritative human approval remains pending until `.seal/plan.yaml`, `.seal/sources.yaml`, and `.seal/proof.yaml` are reviewed.",
      ""
    ].join("\n"),
    { outputRoot, writePolicy, backupRoot, artifactKey: "migration" }
  );

  const artifactIndex = await writeArtifactIndex(outputRoot);
  written.artifactIndex = artifactIndex.outputPath;
  writeActions.artifactIndex = { path: artifactIndex.outputPath, action: "refreshed" };
  written.writeActions = writeActions;

  return written;
}

export async function invokeSeal(target, options = {}) {
  const targetPath = path.resolve(target ?? process.cwd());
  const targetStats = await stat(targetPath);
  const outputRoot = targetStats.isDirectory() ? targetPath : path.dirname(targetPath);
  const targetKind = targetStats.isDirectory() ? "repo" : "plan";
  const targetName = targetStats.isDirectory() ? path.basename(targetPath) : path.basename(targetPath, path.extname(targetPath));
  const repoSourceId = `src.repo-${idPart(path.basename(outputRoot) || "workspace")}`;
  const planSourceId = targetKind === "plan" ? `src.plan-${idPart(targetName)}` : repoSourceId;
  const componentSeed = `cmp.${idPart(targetName)}`;
  const relativePlanPath = targetKind === "plan" ? toPosix(path.relative(outputRoot, targetPath)) : null;
  const planSourceRecord = targetKind === "plan"
    ? createSourceRecord({
        sourceId: planSourceId,
        kind: "human_input",
        authorityState: "human_approved",
        approvalState: "pending",
        confidence: 1,
        description: `Plan file: ${relativePlanPath}`
      })
    : null;

  const map = await createRepoMap(outputRoot, { sourceId: repoSourceId, componentId: componentSeed });
  if (targetKind === "plan") {
    const planCollections = ingestMarkdownPlan(await readFile(targetPath, "utf8"), { sourceId: planSourceId });
    mergeMarkdownPlanIntoMap(map, planCollections, planSourceRecord, relativePlanPath);
  }
  const componentId = firstComponentId(map) ?? componentSeed;
  const filePath = firstMappedFile(map);
  const serviceGapId = firstServiceGapId(map);
  const sources = createSourcesArtifact({
    sources: dedupeById([
      ...sourceRecordsFromMap(map),
      ...(planSourceRecord ? [planSourceRecord] : [])
    ])
  });
  const plan = targetKind === "plan"
    ? await createPlanFromFile(targetPath, outputRoot, planSourceId, componentId)
    : createPlanForRepo(targetPath, planSourceId, componentId);
  const trace = createTraceArtifact({ sourceId: planSourceId, planId: plan.id, componentId });
  const impact = createImpactArtifact({ sourceId: repoSourceId, componentId, filePath, impactId: "IMPACT-initial", serviceGapId });
  const proof = createProofArtifact({ sourceId: repoSourceId });
  const evidenceIndex = createEvidenceIndex(proof, { sourceId: repoSourceId });
  const debt = createDebtRegisterFromMap(map);
  const fly = createFlyArtifact({ sourceId: repoSourceId });
  const debtIds = new Set(asArray(debt.records).map((record) => record.id));
  fly.learning.new_debt = asArray(fly.learning.new_debt).filter((item) => !item.ref || debtIds.has(item.ref));
  const contextPack = createContextPackArtifact({ sourceId: repoSourceId, target: filePath, componentId, impactId: impact.id });
  const artifactSet = { sources, plan, map, trace, impact, proof, evidenceIndex, debt, fly, contextPack };

  await assertGeneratedArtifactsValid(artifactSet);

  if (options.dryRun) {
    return { targetPath, targetKind, outputRoot, artifactSet, written: {} };
  }

  const written = await writeArtifactSet(outputRoot, artifactSet, {
    writePolicy: options.writePolicy
  });
  try {
    const { outputPath: gapReview } = await writeIngestionGapReview(outputRoot, artifactSet);
    written.gapReview = gapReview;
  } catch (error) {
    written.gapReviewSkipped = error.message;
  }

  return { targetPath, targetKind, outputRoot, artifactSet, written };
}
