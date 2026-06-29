#!/usr/bin/env node
import path from "node:path";
import { writeMapViews } from "../map/render-views.mjs";

const targetDir = path.resolve(process.argv[2] ?? process.cwd());
const { markdownPath, mermaidPath, summary } = await writeMapViews(targetDir);

console.log(`Wrote ${markdownPath}`);
console.log(`Wrote ${mermaidPath}`);
console.log(
  `Rendered ${summary.components} components, ${summary.files} files, ${summary.dependencies} dependencies, and ${summary.gaps} open gaps.`
);
