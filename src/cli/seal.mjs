#!/usr/bin/env node
import path from "node:path";
import { writeImpactRecord } from "../impact/change-scope.mjs";
import { invokeSeal } from "../invocation/invoke.mjs";
import { writeLaunchReadinessReport } from "../launch/readiness-report.mjs";
import { writeMapViews } from "../map/render-views.mjs";
import { writeProofGapReport } from "../proof/gap-report.mjs";
import { formatValidationReport, validateSealArtifacts } from "../validation/validate.mjs";

const usage = `Usage:
  seal repo map <directory>
  seal plan ingest <plan.md>
  seal impact <directory> <target> [summary]
  seal proof <directory>
  seal launch <directory>
  seal validate <directory>

The short commands are aliases for the supported SEAL workflow:
repo map initializes repo artifacts and map views, plan ingest initializes plan artifacts,
impact writes a change impact record, proof and launch write readable reports, and
validate checks the .seal workspace.`;

function failUsage(message) {
  if (message) {
    console.error(message);
    console.error("");
  }
  console.error(usage);
  process.exitCode = 2;
}

function requireValue(value, label) {
  if (!value) {
    failUsage(`Missing ${label}.`);
    return undefined;
  }
  return value;
}

function logWritten(written) {
  for (const [label, filePath] of Object.entries(written)) {
    console.log(`${label}: ${filePath}`);
  }
}

async function runRepoMap(directory) {
  const target = requireValue(directory, "repository directory");
  if (!target) {
    return;
  }

  const result = await invokeSeal(target);
  if (result.targetKind !== "repo") {
    throw new Error("repo map expects a directory target.");
  }

  const views = await writeMapViews(result.outputRoot);
  console.log(`SEAL repo map written at ${result.outputRoot}.`);
  logWritten(result.written);
  console.log(`mapMarkdown: ${views.markdownPath}`);
  console.log(`mapMermaid: ${views.mermaidPath}`);
}

async function runPlanIngest(planFile) {
  const target = requireValue(planFile, "Markdown plan file");
  if (!target) {
    return;
  }

  const result = await invokeSeal(target);
  if (result.targetKind !== "plan") {
    throw new Error("plan ingest expects a file target.");
  }

  console.log(`SEAL plan ingested at ${result.outputRoot}.`);
  logWritten(result.written);
}

async function runImpact(rootArg, targetArg, summaryParts) {
  const root = requireValue(rootArg, "workspace directory");
  const target = requireValue(targetArg, "impact target");
  if (!root || !target) {
    return;
  }

  const summary = summaryParts.join(" ");
  const result = await writeImpactRecord(path.resolve(root), {
    target,
    summary: summary || `Assess impact for ${target}.`
  });
  console.log(`SEAL impact written at ${result.outputPath}.`);
}

async function runProof(rootArg) {
  const root = requireValue(rootArg, "workspace directory");
  if (!root) {
    return;
  }

  const result = await writeProofGapReport(path.resolve(root));
  console.log(`SEAL proof report written at ${result.outputPath}.`);
}

async function runLaunch(rootArg) {
  const root = requireValue(rootArg, "workspace directory");
  if (!root) {
    return;
  }

  const result = await writeLaunchReadinessReport(path.resolve(root));
  console.log(`SEAL launch report written at ${result.outputPath}.`);
}

async function runValidate(rootArg) {
  const root = requireValue(rootArg, "workspace directory");
  if (!root) {
    return;
  }

  const result = await validateSealArtifacts(path.resolve(root));
  console.log(formatValidationReport(result));
  process.exitCode = result.valid ? 0 : 1;
}

const [command, subcommand, ...rest] = process.argv.slice(2);

try {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(usage);
  } else if (command === "repo" && subcommand === "map") {
    await runRepoMap(rest[0]);
  } else if (command === "plan" && subcommand === "ingest") {
    await runPlanIngest(rest[0]);
  } else if (command === "impact") {
    await runImpact(subcommand, rest[0], rest.slice(1));
  } else if (command === "proof") {
    await runProof(subcommand);
  } else if (command === "launch") {
    await runLaunch(subcommand);
  } else if (command === "validate") {
    await runValidate(subcommand);
  } else {
    failUsage(`Unknown SEAL command: ${[command, subcommand].filter(Boolean).join(" ")}`);
  }
} catch (error) {
  console.error(`SEAL command failed: ${error.message}`);
  process.exitCode = 1;
}
