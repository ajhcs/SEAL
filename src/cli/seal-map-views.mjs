#!/usr/bin/env node
import path from "node:path";
import { writeMapViews } from "../map/render-views.mjs";

const targetDir = path.resolve(process.argv[2] ?? process.cwd());
const {
  repoMapPath,
  systemMapPath,
  componentGraphPath,
  interfaceDataFlowPath,
  traceabilityPath,
  proofEvidencePath,
  readinessBlockersPath,
  navigationPath,
  summary
} = await writeMapViews(targetDir);

console.log(`Wrote ${repoMapPath}`);
console.log(`Wrote ${systemMapPath}`);
console.log(`Wrote ${componentGraphPath}`);
console.log(`Wrote ${interfaceDataFlowPath}`);
console.log(`Wrote ${traceabilityPath}`);
console.log(`Wrote ${proofEvidencePath}`);
console.log(`Wrote ${readinessBlockersPath}`);
console.log(`Wrote ${navigationPath}`);
console.log(
  `Rendered ${summary.components} components, ${summary.files} files, ${summary.dependencies} dependencies, ${summary.traceRelations} trace relations, and ${summary.gaps} open gaps.`
);
