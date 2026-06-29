import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertGeneratedArtifactsValid, stringifyArtifact } from "../artifacts/generate.mjs";
import { createDebtRegisterFromMap } from "../debt/register.mjs";
import { writeIngestionGapReview } from "../ingestion/gap-review.mjs";
import { ingestMarkdownPlan } from "../ingestion/markdown-plan.mjs";
import { classifyFile } from "../inventory/classify.mjs";
import { listInventoryFiles } from "../inventory/walk.mjs";
import { createRepoMap } from "../inventory/map-repo.mjs";

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function idPart(value) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "target";
}

function repoGapRefs(map) {
  return (map.gaps ?? [])
    .map((gap) => gap.id)
    .filter((id) => id === "gap.repo-component-boundaries" || id === "gap.repo-business-requirements" || id === "gap.repo-test-proof-links");
}

function planWorkspaceGapId(filePath) {
  return `gap.plan-workspace-file-review.${idPart(filePath)}`;
}

function createStarterCompanionArtifacts({ sourceId, componentId, targetLabel, targetKind, map }) {
  const isRepo = targetKind === "repo";
  const repoProofGapRefs = isRepo ? repoGapRefs(map) : [];
  const proofClaims = [
    {
      id: "claim.initial-artifacts-valid",
      type: "launch",
      statement: "SEAL has started an artifact set with source authority and visible gaps.",
      source_refs: [sourceId],
      evidence_refs: [],
      gap_refs: ["gap.initial-proof-evidence"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.6,
      plain_language: "The starter artifacts exist with source authority and visible gaps.",
      next_step: "Attach validation output or keep the proof gap open."
    }
  ];

  if (isRepo) {
    proofClaims.push({
      id: "claim.repo-inventory-covered",
      type: "operational",
      statement: "Every non-ignored repository file is represented in the initial SEAL map, with unknowns and proof limits visible as gaps.",
      source_refs: [sourceId],
      evidence_refs: [],
      gap_refs: repoProofGapRefs.length > 0 ? repoProofGapRefs : ["gap.initial-proof-evidence"],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.7,
      plain_language: "SEAL observed the repo file tree and made the first-pass coverage visible.",
      next_step: "Run seal-validate, review unknowns, and link implementation files to proof evidence."
    });
  }

  const proofNeeded = [
    {
      claim_id: "claim.initial-artifacts-valid",
      reason: "The first artifact set must validate before launch decisions can be trusted.",
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.7,
      plain_language: "SEAL needs validation evidence before launch decisions can be trusted.",
      next_step: "Run seal-validate and record the result in .seal/evidence/index.yaml."
    }
  ];

  if (isRepo) {
    proofNeeded.push({
      claim_id: "claim.repo-inventory-covered",
      reason: "Repo ingestion must prove file coverage and expose limits before deeper mapping or impact work.",
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.7,
      plain_language: "The repo map needs coverage proof plus visible gaps for what static inspection cannot know.",
      next_step: "Review .seal/map.yaml, close or keep map gaps, and attach validation output."
    });
  }

  return {
    impact: {
      schema_version: "0.1.0",
      id: "IMPACT-initial",
      change: {
        summary: `Initial SEAL invocation for ${targetLabel}.`,
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "pending",
        confidence: 0.6,
        plain_language: "SEAL has initialized the workspace, but no specific change has been analyzed yet.",
        example_change: "Describe a planned feature, bug fix, dependency upgrade, or launch decision."
      },
      affected: [
        {
          kind: "component",
          id: componentId,
          reason: "Initial invocation establishes the first mapped scope.",
          source_refs: [sourceId],
          authority_state: "repo_observed",
          approval_state: "pending",
          confidence: 0.6,
          plain_language: "This starter impact is tied to the first mapped component until SEAL analyzes a real change.",
          next_step: "Replace or expand affected records after impact analysis."
        }
      ],
      proof_needed: proofNeeded,
      gaps: [
        {
          id: "gap.initial-change-intent",
          summary: "No proposed change has been supplied yet.",
          reason: "Impact analysis needs a specific change request before affected files and tests can be proven.",
          source_refs: [sourceId],
          authority_state: "repo_observed",
          approval_state: "not_required",
          confidence: 0.8,
          plain_language: "No real change has been provided yet.",
          next_step: "Add a concrete change request before using impact output for decisions."
        }
      ]
    },
    proof: {
      schema_version: "0.1.0",
      claims: proofClaims,
      gaps: [
        {
          id: "gap.initial-proof-evidence",
          summary: "No validation command evidence has been attached yet.",
          reason: "Proof requires recorded evidence or an explicit gap.",
          source_refs: [sourceId],
          authority_state: "repo_observed",
          approval_state: "not_required",
          confidence: 0.8,
          status: "open",
          plain_language: "No command output has been recorded yet.",
          next_step: "Run seal-validate and attach its output as evidence."
        }
      ]
    },
    evidenceIndex: {
      schema_version: "0.1.0",
      evidence: [
        {
          id: "ev.initial-gap",
          type: "gap_record",
          claim_ids: ["claim.initial-artifacts-valid"],
          status: "incomplete",
          captured_at: "1970-01-01T00:00:00.000Z",
          source: {
            kind: "gap_record",
            summary: "Initial proof gap records missing validation evidence."
          },
          artifact_path: ".seal/proof.yaml",
          source_refs: [sourceId],
          authority_state: "repo_observed",
          approval_state: "not_required",
          confidence: 0.8,
          redaction: "not_applicable",
          limitations: isRepo
            ? "Repo ingestion evidence is static inspection until validation commands, test output, or human review are attached."
            : "Initial invocation records proof as an explicit gap until validation evidence is added.",
          plain_language: "This evidence item is intentionally incomplete.",
          how_to_complete: "Attach validation output, test results, static inspection notes, or human approval."
        }
      ]
    }
  };
}

async function createPlanMap(targetPath, outputRoot, sourceId, componentId) {
  const planRelativePath = toPosix(path.relative(outputRoot, targetPath));
  const markdown = await readFile(targetPath, "utf8");
  const extracted = ingestMarkdownPlan(markdown, { sourceId });
  const extractionGaps = extracted.gaps ?? [];
  const workspaceFiles = await listInventoryFiles(outputRoot);
  const fileRecords = workspaceFiles.map((filePath) => {
    const isSelectedPlan = filePath === planRelativePath;
    const reviewGapId = isSelectedPlan ? null : planWorkspaceGapId(filePath);

    return {
      path: filePath,
      classification: classifyFile(filePath),
      component_id: componentId,
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: isSelectedPlan ? "pending" : "not_required",
      confidence: isSelectedPlan ? 0.8 : 0.55,
      purpose: isSelectedPlan
        ? "Plan file coverage for the initial SEAL map."
        : `Observed sibling workspace file ${filePath} while ingesting ${planRelativePath}.`,
      next_step: isSelectedPlan
        ? "Map plan statements to components, proof claims, and visible gaps."
        : "Run plan ingest on this file, move it out of the workspace, or approve that it remains context only.",
      gap_refs: reviewGapId ? [reviewGapId] : []
    };
  });
  const workspaceGaps = workspaceFiles
    .filter((filePath) => filePath !== planRelativePath)
    .map((filePath) => ({
      id: planWorkspaceGapId(filePath),
      summary: `Workspace file ${filePath} was observed but not ingested as the selected plan.`,
      reason: `Plan ingest was run on ${planRelativePath}; this sibling file remains visible so validation does not hide unreviewed context.`,
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "not_required",
      confidence: 0.75,
      status: "open",
      plain_language: "SEAL saw another file next to the plan, but did not treat it as approved plan authority.",
      next_step: "Run plan ingest on this file too, move it out of the workspace, or approve/exclude it explicitly."
    }));

  return {
    schema_version: "0.1.0",
    sources: [
      {
        id: sourceId,
        kind: "user_plan",
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 1,
        label: `Plan file: ${planRelativePath}`,
        workspace_file_count: workspaceFiles.length,
        plain_language: "The user supplied this plan as the first source of authority."
      }
    ],
    components: [
      {
        id: componentId,
        name: "Planned system",
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "pending",
        confidence: 0.8,
        purpose: "Starter component representing the supplied plan.",
        source_files: fileRecords.map((file) => file.path),
        next_step: "Decompose the plan into real components, risks, requirements, and proof needs."
      }
    ],
    files: fileRecords,
    gaps: [
      ...extractionGaps,
      {
        id: "gap.plan-human-review",
        summary: "Extracted plan records need human review before they can become approved baseline facts.",
        reason: "Markdown ingestion is conservative and records inferred requirements, risks, assumptions, trace links, and gates as pending review.",
        source_refs: [sourceId],
        authority_state: "inferred",
        approval_state: "not_required",
        confidence: 0.8,
        status: "open",
        plain_language: "SEAL extracted useful structure, but a person still needs to review it.",
        next_step: "Approve, edit, or reject extracted plan records before launch decisions depend on them."
      },
      ...workspaceGaps
    ],
    requirements: extracted.requirements,
    risks: extracted.risks,
    assumptions: extracted.assumptions,
    trace_links: extracted.trace_links,
    launch_gates: extracted.launch_gates
  };
}

async function writeArtifactSet(outputRoot, artifactSet) {
  const sealRoot = path.join(outputRoot, ".seal");
  const impactRoot = path.join(sealRoot, "impacts");
  const evidenceRoot = path.join(sealRoot, "evidence");
  const evidenceFilesRoot = path.join(evidenceRoot, "files");
  await mkdir(impactRoot, { recursive: true });
  await mkdir(evidenceFilesRoot, { recursive: true });

  const written = {
    map: path.join(sealRoot, "map.yaml"),
    debt: path.join(sealRoot, "debt.yaml"),
    impact: path.join(impactRoot, "IMPACT-initial.yaml"),
    proof: path.join(sealRoot, "proof.yaml"),
    evidenceIndex: path.join(evidenceRoot, "index.yaml")
  };

  await writeFile(written.map, stringifyArtifact(artifactSet.map), "utf8");
  await writeFile(written.debt, stringifyArtifact(artifactSet.debt), "utf8");
  await writeFile(written.impact, stringifyArtifact(artifactSet.impact), "utf8");
  await writeFile(written.proof, stringifyArtifact(artifactSet.proof), "utf8");
  await writeFile(written.evidenceIndex, stringifyArtifact(artifactSet.evidenceIndex), "utf8");

  return written;
}

export async function invokeSeal(target, options = {}) {
  const targetPath = path.resolve(target ?? process.cwd());
  const targetStats = await stat(targetPath);
  const outputRoot = targetStats.isDirectory() ? targetPath : path.dirname(targetPath);
  const targetKind = targetStats.isDirectory() ? "repo" : "plan";
  const targetName = targetStats.isDirectory() ? path.basename(targetPath) : path.basename(targetPath, path.extname(targetPath));
  const sourceId = `src.invocation-${idPart(targetName)}`;
  const componentId = `cmp.${idPart(targetName)}`;

  const map = targetKind === "repo"
    ? await createRepoMap(targetPath, { sourceId, componentId })
    : await createPlanMap(targetPath, outputRoot, sourceId, componentId);

  const companions = createStarterCompanionArtifacts({
    sourceId,
    componentId,
    targetLabel: targetStats.isDirectory() ? targetPath : toPosix(path.relative(outputRoot, targetPath)),
    targetKind,
    map
  });
  const artifactSet = { map, debt: createDebtRegisterFromMap(map), ...companions };
  await assertGeneratedArtifactsValid(artifactSet);

  if (options.dryRun) {
    return { targetPath, targetKind, outputRoot, artifactSet, written: {} };
  }

  const written = await writeArtifactSet(outputRoot, artifactSet);
  const { outputPath: gapReview } = await writeIngestionGapReview(outputRoot, artifactSet);
  return { targetPath, targetKind, outputRoot, artifactSet, written: { ...written, gapReview } };
}
