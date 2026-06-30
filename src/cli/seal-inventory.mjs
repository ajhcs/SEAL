#!/usr/bin/env node
import path from "node:path";
import { createDebtRegisterFromMap } from "../debt/register.mjs";
import { writeIngestionGapReview } from "../ingestion/gap-review.mjs";
import { writeRepoMap } from "../inventory/map-repo.mjs";
import { writeMapViews } from "../map/render-views.mjs";

const targetDir = path.resolve(process.argv[2] ?? process.cwd());
const { map, outputPath } = await writeRepoMap(targetDir);
const { repoMapPath, systemMapPath } = await writeMapViews(targetDir);
const { outputPath: gapReviewPath } = await writeIngestionGapReview(targetDir, {
  map,
  debt: createDebtRegisterFromMap(map)
});

console.log(`Wrote ${outputPath}`);
console.log(`Wrote ${repoMapPath}`);
console.log(`Wrote ${systemMapPath}`);
console.log(`Wrote ${gapReviewPath}`);
console.log(`Mapped ${map.files.length} files with ${map.gaps.length} visible unknowns.`);
