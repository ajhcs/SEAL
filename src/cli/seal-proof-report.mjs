#!/usr/bin/env node
import path from "node:path";
import { writeProofGapReport } from "../proof/gap-report.mjs";

function usage() {
  return [
    "Usage: seal-proof-report <root> [--profile explore|standard|launch|mission-critical]",
    "",
    "Writes .seal/reports/proof-gaps.md from .seal/proof.yaml and .seal/evidence/index.yaml."
  ].join("\n");
}

function parseArgs(args) {
  let root;
  let profile;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--profile") {
      profile = args[index + 1];
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      profile = arg.slice("--profile=".length);
    } else if (!root) {
      root = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return { root, profile };
}

const { root: rootArg, profile } = parseArgs(process.argv.slice(2));
if (!rootArg) {
  console.error(usage());
  process.exit(2);
}

try {
  const { report, outputPath } = await writeProofGapReport(path.resolve(rootArg), { profile });
  console.log(`SEAL proof gap report written: ${outputPath}`);
  console.log(`Rigor profile: ${report.profile.label} (${report.profile.id})`);
  console.log(`Launch proof status: ${report.readiness}`);
  console.log(`Blocked claims: ${report.counts.blocked ?? 0}`);
  console.log(`Invalid claims: ${report.counts.invalid ?? 0}`);
} catch (error) {
  console.error(`SEAL proof gap report failed: ${error.message}`);
  process.exit(1);
}
