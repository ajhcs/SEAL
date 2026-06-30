#!/usr/bin/env node
import path from "node:path";
import { runGuideWorkflow } from "../guide/workflow.mjs";
import { writeImpactRecord } from "../impact/change-scope.mjs";
import { invokeSeal } from "../invocation/invoke.mjs";
import { writeLaunchReadinessReport } from "../launch/readiness-report.mjs";
import { writeMapViews } from "../map/render-views.mjs";
import { writeProofGapReport } from "../proof/gap-report.mjs";
import { formatValidationReport, validateSealArtifacts } from "../validation/validate.mjs";

const usage = `Usage:
  seal map <directory>
  seal guide <directory|plan.md> [change target] [summary]
  seal plan <directory|plan.md>
  seal impact <directory> <target> [summary]
  seal prove <directory>
  seal fly <directory>
  seal validate <directory>

Compatibility aliases:
  seal repo map <directory>
  seal plan ingest <plan.md>
  seal proof <directory>
  seal launch <directory>

The public SEAL surface is MAP, PLAN, IMPACT, PROVE, and FLY. Support
contracts such as TRACE, SOURCES, DEBT, generated views, context packs, and
validation reports are written under .seal/ as implementation artifacts.`;

function failUsage(message) {
  console.error(`${message}\n\n${usage}`);
  process.exitCode = 1;
}

function requireValue(value, label) {
  if (!value) {
    throw new Error(`Missing ${label}.`);
  }
  return value;
}

function logWritten(written) {
  for (const [artifact, filePath] of Object.entries(written ?? {})) {
    if (!filePath || typeof filePath !== "string") {
      continue;
    }
    console.log(`wrote ${artifact}: ${filePath}`);
  }
  for (const [artifact, action] of Object.entries(written?.writeActions ?? {})) {
    if (!action?.action || !action?.path) {
      continue;
    }
    console.log(`${action.action} ${artifact}: ${action.path}`);
  }
}

async function runMap(directory) {
  const target = requireValue(directory, "directory");
  const result = await invokeSeal(target);
  if (result.targetKind !== "repo") {
    throw new Error("seal map expects a directory target.");
  }

  logWritten(result.written);
  const views = await writeMapViews(result.outputRoot);
  console.log(`wrote repo map: ${views.repoMapPath}`);
  console.log(`wrote system map: ${views.systemMapPath}`);
  console.log(`wrote component graph: ${views.componentGraphPath}`);
  console.log(`wrote interface/data-flow map: ${views.interfaceDataFlowPath}`);
  console.log(`wrote debt view: ${views.debtPath}`);
}

async function runPlan(targetArg) {
  const target = requireValue(targetArg, "directory or plan file");
  const result = await invokeSeal(target);
  logWritten(result.written);
  if (result.written?.plan) {
    console.log(`updated PLAN baseline: ${result.written.plan}`);
  }
}

async function runGuide(targetArg, changeTargetArg, summaryParts) {
  const target = requireValue(targetArg, "directory or plan file");
  const summary = summaryParts.length > 0 ? summaryParts.join(" ") : undefined;
  const result = await runGuideWorkflow(target, {
    changeTarget: changeTargetArg,
    summary
  });

  logWritten(result.written);
  console.log(formatValidationReport(result.validation));
  console.log("Next steps:");
  for (const step of result.nextSteps) {
    console.log(`- ${step}`);
  }
  process.exitCode = result.validation.valid ? 0 : 1;
}

async function runImpact(rootArg, targetArg, summaryParts) {
  const root = path.resolve(requireValue(rootArg, "directory"));
  const target = requireValue(targetArg, "impact target");
  const summary = summaryParts.length > 0 ? summaryParts.join(" ") : `Assess change impact for ${target}.`;
  const { outputPath } = await writeImpactRecord(root, { target, summary });
  console.log(`wrote impact: ${outputPath}`);
}

async function runProof(rootArg) {
  const root = path.resolve(requireValue(rootArg, "directory"));
  const { outputPath, proofGapsPath, legacyOutputPath } = await writeProofGapReport(root);
  console.log(`wrote proof gaps: ${proofGapsPath ?? outputPath}`);
  if (legacyOutputPath) {
    console.log(`wrote legacy proof gaps report: ${legacyOutputPath}`);
  }
}

async function runFly(rootArg) {
  const root = path.resolve(requireValue(rootArg, "directory"));
  const { outputPath, readinessViewPath, legacyOutputPath } = await writeLaunchReadinessReport(root);
  console.log(`wrote fly readiness: ${readinessViewPath ?? outputPath}`);
  if (legacyOutputPath) {
    console.log(`wrote legacy readiness report: ${legacyOutputPath}`);
  }
}

async function runValidate(rootArg) {
  const root = path.resolve(requireValue(rootArg, "directory"));
  const report = await validateSealArtifacts(root);
  console.log(formatValidationReport(report));
  process.exitCode = report.valid ? 0 : 1;
}

const [command, subcommand, ...rest] = process.argv.slice(2);

try {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(usage);
  } else if (command === "map") {
    await runMap(subcommand);
  } else if (command === "repo" && subcommand === "map") {
    await runMap(rest[0]);
  } else if (command === "guide") {
    await runGuide(subcommand, rest[0], rest.slice(1));
  } else if (command === "plan" && subcommand === "ingest") {
    await runPlan(rest[0]);
  } else if (command === "plan") {
    await runPlan(subcommand);
  } else if (command === "impact") {
    await runImpact(subcommand, rest[0], rest.slice(1));
  } else if (command === "prove" || command === "proof") {
    await runProof(subcommand);
  } else if (command === "fly" || command === "launch") {
    await runFly(subcommand);
  } else if (command === "validate") {
    await runValidate(subcommand);
  } else {
    failUsage(`Unknown SEAL command: ${command}${subcommand ? ` ${subcommand}` : ""}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
