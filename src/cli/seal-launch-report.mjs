#!/usr/bin/env node
import { writeLaunchReadinessReport } from "../launch/readiness-report.mjs";

const root = process.argv[2] ?? process.cwd();

try {
  const { report, outputPath } = await writeLaunchReadinessReport(root);
  console.log(`Wrote launch readiness report: ${outputPath}`);
  console.log(`Launch decision: ${report.decision.label}`);
} catch (error) {
  console.error(`seal-launch-report failed: ${error.message}`);
  process.exitCode = 1;
}
