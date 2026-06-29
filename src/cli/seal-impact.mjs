#!/usr/bin/env node
import path from "node:path";
import { writeImpactRecord } from "../impact/change-scope.mjs";

function usage() {
  return [
    "Usage: seal-impact <root> <target> [summary...]",
    "",
    "Writes .seal/impacts/IMPACT-*.yaml for a proposed changed file or artifact id."
  ].join("\n");
}

const [rootArg, targetArg, ...summaryParts] = process.argv.slice(2);
if (!rootArg || !targetArg) {
  console.error(usage());
  process.exit(2);
}

try {
  const { impact, outputPath } = await writeImpactRecord(path.resolve(rootArg), {
    target: targetArg,
    summary: summaryParts.join(" ") || `Assess impact of ${targetArg}.`
  });
  console.log(`SEAL impact written: ${outputPath}`);
  console.log(`Affected records: ${impact.affected.length}`);
  console.log(`Gaps: ${impact.gaps.length}`);
} catch (error) {
  console.error(`SEAL impact failed: ${error.message}`);
  process.exit(1);
}
