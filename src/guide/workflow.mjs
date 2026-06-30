import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GENERATED_VIEW_NOTICE, QUESTION_DECISION_TREE } from "../contracts/constants.mjs";
import { writeImpactRecord } from "../impact/change-scope.mjs";
import { invokeSeal } from "../invocation/invoke.mjs";
import { writeLaunchReadinessReport } from "../launch/readiness-report.mjs";
import { writeMapViews } from "../map/render-views.mjs";
import { writeProofGapReport } from "../proof/gap-report.mjs";
import { formatValidationReport, validateSealArtifacts } from "../validation/validate.mjs";

export const GUIDE_FLOW_STATES = Object.freeze([
  {
    id: "start",
    title: "Start",
    prompt: "What path or plan should SEAL inspect first?",
    artifacts: ["SOURCES"]
  },
  {
    id: "project-intent",
    title: "Project Intent",
    prompt: "Who is this for, what should change, and what would prove it worked?",
    artifacts: ["PLAN"]
  },
  {
    id: "system-boundary",
    title: "System Boundary",
    prompt: "What is inside the system boundary and what is explicitly outside it?",
    artifacts: ["MAP"]
  },
  {
    id: "current-reality",
    title: "Current Reality",
    prompt: "What files, components, tests, services, gaps, and debt can the repo prove today?",
    artifacts: ["MAP", "DEBT"]
  },
  {
    id: "planned-change",
    title: "Planned Change",
    prompt: "What file, behavior, or decision is changing?",
    artifacts: ["IMPACT"]
  },
  {
    id: "proof-plan",
    title: "Proof Plan",
    prompt: "What evidence, tests, or approvals would prove the claims?",
    artifacts: ["PROVE"]
  },
  {
    id: "readiness-review",
    title: "Readiness Review",
    prompt: "What blocks launch, what is unknown, and what is the next validation-backed action?",
    artifacts: ["FLY"]
  }
]);

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRelative(root, filePath) {
  if (!filePath) {
    return undefined;
  }
  return path.relative(root, filePath).replaceAll(path.sep, "/") || ".";
}

function markdownList(values, emptyText = "None.") {
  if (!values || values.length === 0) {
    return [`- ${emptyText}`];
  }
  return values.map((value) => `- ${value}`);
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function validationNextSteps(validation) {
  if (validation?.valid) {
    return ["Validation passed. Keep rerunning `seal validate` as artifacts change."];
  }

  return asList(validation?.diagnostics).slice(0, 5).map((diagnostic) => {
    const location = diagnostic.path ?? diagnostic.file ?? diagnostic.artifactType;
    return `Fix ${diagnostic.artifactType} at ${location}: ${diagnostic.message}`;
  });
}

function proofNextStep(proofReport) {
  const claim = asList(proofReport?.report?.claims).find((item) => item.status !== "proven");
  if (!claim) {
    return undefined;
  }
  return `Resolve proof gap ${claim.claim.id}: ${claim.nextAction}`;
}

function launchNextStep(launchReport) {
  const action = asList(launchReport?.report?.next_actions)[0];
  if (action?.summary && action?.reason) {
    return `${action.summary} ${action.reason}`;
  }
  if (launchReport?.report?.readiness_level?.next_action) {
    return launchReport.report.readiness_level.next_action;
  }
  return undefined;
}

function deriveNextSteps({ validation, changeTarget, proofReport, launchReport }) {
  return unique([
    ...validationNextSteps(validation),
    changeTarget
      ? undefined
      : "Name the planned change target, then rerun `seal guide <target> <change target> [summary]` so IMPACT can scope affected files and proof obligations.",
    proofNextStep(proofReport),
    launchNextStep(launchReport),
    "Open `.seal/reports/guide.md` for the human-readable path, then edit canonical `.seal/*.yaml` records when product intent or proof changes."
  ]);
}

function canonicalArtifacts(written) {
  return [
    ["PLAN", written.plan],
    ["MAP", written.map],
    ["IMPACT", written.impact],
    ["PROVE", written.proof],
    ["DEBT", written.debt],
    ["FLY", written.fly],
    ["TRACE", written.trace],
    ["SOURCES", written.sources],
    ["Evidence index", written.evidenceIndex],
    ["Context pack", written.contextPack],
    ["Guide report", written.guideReport],
    ["Proof gaps", written.proofGaps],
    ["Launch readiness", written.launchReadiness],
    ["Repo map view", written.repoMap]
  ];
}

function createGuideMarkdown(result) {
  const {
    outputRoot,
    targetPath,
    targetKind,
    flow,
    written,
    validation,
    validationText,
    nextSteps,
    change
  } = result;
  const lines = [
    "# SEAL Guided Workflow",
    "",
    GENERATED_VIEW_NOTICE,
    "",
    "This guide is a generated, non-authoritative view. Canonical records remain in `.seal/*.yaml`.",
    "",
    "## Target",
    "",
    `- Input: ${targetPath}`,
    `- Kind: ${targetKind}`,
    `- SEAL root: ${outputRoot}`,
    "",
    "## Flow States",
    ""
  ];

  for (const state of flow) {
    lines.push(`- **${state.title}** (${state.id}): ${state.prompt} Artifacts: ${state.artifacts.join(", ")}.`);
  }

  lines.push("", "## Starter Questions", "");
  for (const item of QUESTION_DECISION_TREE) {
    lines.push(`- ${item.question} (${item.field}; ask when ${item.ask_when})`);
  }

  lines.push("", "## Canonical Artifacts", "");
  for (const [label, filePath] of canonicalArtifacts(written)) {
    if (filePath) {
      lines.push(`- ${label}: \`${normalizeRelative(outputRoot, filePath)}\``);
    }
  }

  if (change) {
    lines.push(
      "",
      "## Planned Change",
      "",
      `- Impact: ${change.id}`,
      `- Target: ${change.change?.target ?? "unknown"}`,
      `- Summary: ${change.change?.summary ?? "No summary supplied."}`
    );
  }

  lines.push(
    "",
    "## Validation",
    "",
    "```text",
    validationText.trim(),
    "```",
    "",
    `Validation status: ${validation.valid ? "passed" : "failed"}`,
    "",
    "## Next Steps",
    "",
    ...markdownList(nextSteps)
  );

  return `${lines.join("\n")}\n`;
}

export async function runGuideWorkflow(targetArg, options = {}) {
  if (!targetArg) {
    throw new Error("Missing directory or plan file.");
  }

  const baseResult = await invokeSeal(targetArg);
  const outputRoot = baseResult.outputRoot;
  const mapViews = await writeMapViews(outputRoot);

  let impactResult;
  if (options.changeTarget) {
    impactResult = await writeImpactRecord(outputRoot, {
      target: options.changeTarget,
      summary: options.summary ?? `Assess change impact for ${options.changeTarget}.`
    });
  }

  const proofReport = await writeProofGapReport(outputRoot);
  const launchReport = await writeLaunchReadinessReport(outputRoot);
  const validation = await validateSealArtifacts(outputRoot);
  const validationText = formatValidationReport(validation);
  const reportsRoot = path.join(outputRoot, ".seal", "reports");
  const guideReportPath = path.join(reportsRoot, "guide.md");

  const written = {
    ...baseResult.written,
    repoMap: mapViews.repoMapPath,
    systemMap: mapViews.systemMapPath,
    componentGraph: mapViews.componentGraphPath,
    interfaceDataFlow: mapViews.interfaceDataFlowPath,
    debtView: mapViews.debtPath,
    impact: impactResult?.outputPath,
    proofGaps: proofReport.outputPath,
    launchReadiness: launchReport.outputPath,
    guideReport: guideReportPath
  };

  const nextSteps = deriveNextSteps({
    validation,
    changeTarget: options.changeTarget,
    proofReport,
    launchReport
  });

  const result = {
    targetPath: baseResult.targetPath,
    targetKind: baseResult.targetKind,
    outputRoot,
    flow: GUIDE_FLOW_STATES,
    written,
    validation,
    validationText,
    nextSteps,
    guideReportPath,
    reports: {
      mapViews,
      proof: proofReport,
      launch: launchReport
    },
    change: impactResult?.impact
  };

  await mkdir(reportsRoot, { recursive: true });
  await writeFile(guideReportPath, createGuideMarkdown(result), "utf8");
  return result;
}
