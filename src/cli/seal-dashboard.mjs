#!/usr/bin/env node
import path from "node:path";
import { writeDashboard } from "../views/dashboard.mjs";

function requireValue(value, label) {
  if (!value) {
    throw new Error(`Missing ${label}.`);
  }
  return value;
}

function parseArgs(args) {
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
  return { root: path.resolve(requireValue(values[0], "directory")), profile };
}

try {
  const { root, profile } = parseArgs(process.argv.slice(2));
  const { dashboard, outputPath } = await writeDashboard(root, { profile });
  console.log(`wrote dashboard: ${outputPath}`);
  console.log(`launch decision: ${dashboard.launch.decision.label}`);
  console.log(`readiness level: ${dashboard.launch.readiness_level.id} - ${dashboard.launch.readiness_level.label}`);
  console.log(`rigor profile: ${dashboard.launch.profile.label} (${dashboard.launch.profile.id})`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
