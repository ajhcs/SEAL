#!/usr/bin/env node
import path from "node:path";
import { writeIngestionGapReview } from "../ingestion/gap-review.mjs";

const targetDir = path.resolve(process.argv[2] ?? process.cwd());
const { review, outputPath } = await writeIngestionGapReview(targetDir);

console.log(`Wrote ${outputPath}`);
console.log(`Ranked ${review.items.length} ingestion gaps.`);
