#!/usr/bin/env node
import path from "node:path";
import { writeAiDocs, writeHumanDocs } from "../docs/shaper.mjs";
import { writeImpactRecord } from "../impact/change-scope.mjs";
import { invokeSeal } from "../invocation/invoke.mjs";
import { writeLaunchReadinessReport } from "../launch/readiness-report.mjs";
import { writeMapViews } from "../map/render-views.mjs";
import { writeProofGapReport } from "../proof/gap-report.mjs";
import { routeSealRequest } from "../skill-routing/route.mjs";
import { formatValidationReport, validateSealArtifacts } from "../validation/validate.mjs";
import { writeDashboard } from "../views/dashboard.mjs";

const usage = `Usage:
  seal map <directory>
  seal plan <directory|plan.md>
  seal impact <directory> <target> [summary]
  seal prove <directory>
  seal fly <directory>
  seal docs human <directory> [--write] [--target <file>] [--approve-target]
  seal docs ai <directory> [--target <file-or-artifact>]
  seal docs <directory>
  seal dashboard <directory>
  seal validate <directory>
  seal guide [request] [--profile explore|standard|launch|mission-critical]

Options:
  --profile <name>  Select a SEAL rigor profile for guide/prove/fly/dashboard outputs.

Compatibility aliases:
  seal repo map <directory>
  seal plan ingest <plan.md>
  seal proof <directory>
  seal launch <directory>

The public SEAL surface is MAP, PLAN, IMPACT, PROVE, FLY, and dashboard. Support
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
    console.log(`wrote ${artifact}: ${filePath}`);
  }
}

function parseProfileArgs(args) {
  const values = [];
  let profile;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--profile") {
      profile = requireValue(args[index + 1], "profile");
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      profile = requireValue(arg.slice("--profile=".length), "profile");
    } else {
      values.push(arg);
    }
  }
  return { values, profile };
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

async function runImpact(rootArg, targetArg, summaryParts) {
  const root = path.resolve(requireValue(rootArg, "directory"));
  const target = requireValue(targetArg, "impact target");
  const summary = summaryParts.length > 0 ? summaryParts.join(" ") : `Assess change impact for ${target}.`;
  const { outputPath } = await writeImpactRecord(root, { target, summary });
  console.log(`wrote impact: ${outputPath}`);
}

async function runProof(rootArg, options = {}) {
  const root = path.resolve(requireValue(rootArg, "directory"));
  const { report, outputPath, proofGapsPath, legacyOutputPath } = await writeProofGapReport(root, options);
  console.log(`wrote proof gaps: ${proofGapsPath ?? outputPath}`);
  console.log(`rigor profile: ${report.profile.label} (${report.profile.id})`);
  if (legacyOutputPath) {
    console.log(`wrote legacy proof gaps report: ${legacyOutputPath}`);
  }
}

async function runFly(rootArg, options = {}) {
  const root = path.resolve(requireValue(rootArg, "directory"));
  const { report, outputPath, readinessViewPath, legacyOutputPath } = await writeLaunchReadinessReport(root, options);
  console.log(`wrote fly readiness: ${readinessViewPath ?? outputPath}`);
  console.log(`rigor profile: ${report.profile.label} (${report.profile.id})`);
  if (legacyOutputPath) {
    console.log(`wrote legacy readiness report: ${legacyOutputPath}`);
  }
}

async function runDashboard(rootArg, options = {}) {
  const root = path.resolve(requireValue(rootArg, "directory"));
  const { dashboard, outputPath } = await writeDashboard(root, options);
  console.log(`wrote dashboard: ${outputPath}`);
  console.log(`launch decision: ${dashboard.launch.decision.label}`);
  console.log(`readiness level: ${dashboard.launch.readiness_level.id} - ${dashboard.launch.readiness_level.label}`);
  console.log(`rigor profile: ${dashboard.launch.profile.label} (${dashboard.launch.profile.id})`);
}

function parseDocsArgs(args) {
  const values = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--write") {
      options.write = true;
    } else if (arg === "--approve-target") {
      options.approveTarget = true;
    } else if (arg === "--target") {
      options.target = requireValue(args[index + 1], "docs target");
      index += 1;
    } else if (arg.startsWith("--target=")) {
      options.target = requireValue(arg.slice("--target=".length), "docs target");
    } else {
      values.push(arg);
    }
  }
  return { values, options };
}

async function runDocs(args) {
  const { values, options } = parseDocsArgs(args);
  const first = values[0];
  const mode = first === "human" || first === "ai" ? first : "human";
  const rootArg = mode === first ? values[1] : first;
  const root = path.resolve(requireValue(rootArg, "directory"));

  if (mode === "ai") {
    const { outputPath, contextPackPath, reportPath } = await writeAiDocs(root, options);
    console.log(`wrote ai docs: ${outputPath}`);
    console.log(`wrote context pack: ${contextPackPath}`);
    console.log(`wrote context pack json: ${reportPath}`);
    return;
  }

  const { outputPath, debtPath, docsDebt, writeResult } = await writeHumanDocs(root, options);
  console.log(`wrote human docs proposal: ${outputPath}`);
  console.log(`updated documentation debt: ${debtPath}`);
  console.log(`docs debt records: ${docsDebt.length}`);
  if (writeResult.wrote) {
    console.log(`updated bounded docs target: ${writeResult.mode}`);
  }
}

async function runValidate(rootArg) {
  const root = path.resolve(requireValue(rootArg, "directory"));
  const report = await validateSealArtifacts(root);
  console.log(formatValidationReport(report));
  process.exitCode = report.valid ? 0 : 1;
}

async function runGuide(args) {
  const { values, profile } = parseProfileArgs(args);
  const request = values.join(" ") || "Use SEAL to map this repo and tell me what is unknown";
  const route = routeSealRequest(request, { profile });
  console.log(`mode: ${route.mode}`);
  console.log(`path: ${route.path.join(" -> ")}`);
  console.log(`profile: ${route.profile.label} (${route.profile.id})`);
  console.log(`focus: ${route.profile.prompt_focus}`);
  console.log(`ask policy: ${route.askPolicy}`);
  console.log("starter questions:");
  for (const question of route.starterQuestions) {
    console.log(`- ${question}`);
  }
  if (route.escalationRecommendations.length > 0) {
    console.log("escalation recommendations:");
    for (const item of route.escalationRecommendations) {
      console.log(`- ${item.summary}`);
    }
  }
}

const [command, subcommand, ...rest] = process.argv.slice(2);

try {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(usage);
  } else if (command === "map") {
    await runMap(subcommand);
  } else if (command === "repo" && subcommand === "map") {
    await runMap(rest[0]);
  } else if (command === "plan" && subcommand === "ingest") {
    await runPlan(rest[0]);
  } else if (command === "plan") {
    await runPlan(subcommand);
  } else if (command === "impact") {
    await runImpact(subcommand, rest[0], rest.slice(1));
  } else if (command === "prove" || command === "proof") {
    const parsed = parseProfileArgs([subcommand, ...rest].filter(Boolean));
    await runProof(parsed.values[0], { profile: parsed.profile });
  } else if (command === "fly" || command === "launch") {
    const parsed = parseProfileArgs([subcommand, ...rest].filter(Boolean));
    await runFly(parsed.values[0], { profile: parsed.profile });
  } else if (command === "docs") {
    await runDocs([subcommand, ...rest].filter(Boolean));
  } else if (command === "dashboard") {
    const parsed = parseProfileArgs([subcommand, ...rest].filter(Boolean));
    await runDashboard(parsed.values[0], { profile: parsed.profile });
  } else if (command === "guide") {
    await runGuide([subcommand, ...rest].filter(Boolean));
  } else if (command === "validate") {
    await runValidate(subcommand);
  } else {
    failUsage(`Unknown SEAL command: ${command}${subcommand ? ` ${subcommand}` : ""}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
