#!/usr/bin/env node
import path from "node:path";
import { writeProofGapReport } from "../proof/gap-report.mjs";

function usage() {
  return [
    "Usage: seal-proof-report <root>",
    "",
    "Writes .seal/reports/proof-gaps.md from .seal/proof.yaml and .seal/evidence/index.yaml."
  ].join("\n");
}

const [rootArg] = process.argv.slice(2);
if (!rootArg) {
  console.error(usage());
  process.exit(2);
}

try {
  const { report, outputPath } = await writeProofGapReport(path.resolve(rootArg));
  console.log(`SEAL proof gap report written: ${outputPath}`);
  console.log(`Launch proof status: ${report.readiness}`);
  console.log(`Blocked claims: ${report.counts.blocked ?? 0}`);
  console.log(`Invalid claims: ${report.counts.invalid ?? 0}`);
} catch (error) {
  console.error(`SEAL proof gap report failed: ${error.message}`);
  process.exit(1);
}
