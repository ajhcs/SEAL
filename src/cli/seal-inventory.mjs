#!/usr/bin/env node
import path from "node:path";
import { createDebtRegisterFromMap } from "../debt/register.mjs";
import { writeIngestionGapReview } from "../ingestion/gap-review.mjs";
import { writeRepoMap } from "../inventory/map-repo.mjs";
import { writeMapViews } from "../map/render-views.mjs";

const targetDir = path.resolve(process.argv[2] ?? process.cwd());
const { map, outputPath } = await writeRepoMap(targetDir);
const { markdownPath, mermaidPath } = await writeMapViews(targetDir);
const { outputPath: gapReviewPath } = await writeIngestionGapReview(targetDir, {
  map,
  debt: createDebtRegisterFromMap(map)
});

console.log(`Wrote ${outputPath}`);
console.log(`Wrote ${markdownPath}`);
console.log(`Wrote ${mermaidPath}`);
console.log(`Wrote ${gapReviewPath}`);
console.log(`Mapped ${map.files.length} files with ${map.gaps.length} visible unknowns.`);
