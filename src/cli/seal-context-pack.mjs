#!/usr/bin/env node
import path from "node:path";
import { writeContextPack } from "../context/pack.mjs";

function usage() {
  return [
    "Usage: seal-context-pack <root> <target> [summary...]",
    "",
    "Writes .seal/reports/context-pack.json for a proposed changed file or artifact id."
  ].join("\n");
}

const [rootArg, targetArg, ...summaryParts] = process.argv.slice(2);
if (!rootArg || !targetArg) {
  console.error(usage());
  process.exit(2);
}

try {
  const { pack, outputPath } = await writeContextPack(path.resolve(rootArg), {
    target: targetArg,
    summary: summaryParts.join(" ") || `Build context pack for ${targetArg}.`
  });
  console.log(`SEAL context pack written: ${outputPath}`);
  console.log(`Components: ${pack.scope.components.length}`);
  console.log(`Files: ${pack.scope.files.length}`);
  console.log(`Claims: ${pack.scope.claims.length}`);
  console.log(`Gaps: ${pack.scope.gaps.length}`);
} catch (error) {
  console.error(`SEAL context pack failed: ${error.message}`);
  process.exit(1);
}
