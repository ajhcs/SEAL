#!/usr/bin/env node
import { writeLaunchReadinessReport } from "../launch/readiness-report.mjs";

function parseArgs(args) {
  const values = [];
  let profile;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--profile") {
      profile = args[index + 1];
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      profile = arg.slice("--profile=".length);
    } else {
      values.push(arg);
    }
  }
  return { root: values[0] ?? process.cwd(), profile };
}

const { root, profile } = parseArgs(process.argv.slice(2));

try {
  const { report, outputPath } = await writeLaunchReadinessReport(root, { profile });
  console.log(`Wrote launch readiness report: ${outputPath}`);
  console.log(`Launch decision: ${report.decision.label}`);
  console.log(`Rigor profile: ${report.profile.label} (${report.profile.id})`);
} catch (error) {
  console.error(`seal-launch-report failed: ${error.message}`);
  process.exitCode = 1;
}
