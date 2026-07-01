import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(rootDir, ".seal", "reports", "skill-quality-audit.md");
const report = await readFile(reportPath, "utf8");

const requiredStrings = [
  "Generated report",
  "non-authoritative",
  "https://github.com/mattpocock/skills",
  "b38badf7091afc614dedffc03ea8c8ad2b643cb4",
  "skills/productivity/writing-great-skills/SKILL.md",
  "skills/productivity/writing-great-skills/GLOSSARY.md",
  "src/cli/seal.mjs",
  "plugin/manifest.json",
  "Blocking Implementation Findings",
  "Do not close `seal-product-guided-layer`",
];

for (const expected of requiredStrings) {
  assert.ok(report.includes(expected), `audit report should include ${expected}`);
}

const skillPaths = [
  "plugin/skills/seal/SKILL.md",
  "plugin/skills/seal-plan/SKILL.md",
  "plugin/skills/seal-map/SKILL.md",
  "plugin/skills/seal-impact/SKILL.md",
  "plugin/skills/seal-proof/SKILL.md",
];

for (const skillPath of skillPaths) {
  assert.ok(report.includes(skillPath), `audit report should cover ${skillPath}`);
}

const criteria = [
  "Predictability",
  "Invocation mode",
  "Descriptions",
  "Information hierarchy",
  "Split decisions",
  "Pruning",
  "Human vs AI/machine docs",
  "Traceability",
];

for (const criterion of criteria) {
  assert.ok(report.includes(criterion), `audit report should evaluate ${criterion}`);
}

const trackedBeads = [
  "seal-skill-quality-audit",
  "seal-docs-shaper",
  "seal-human-dashboard",
  "seal-mermaid-navigation",
  "seal-guided-e2e",
  "seal-product-guided-layer",
];

for (const beadId of trackedBeads) {
  assert.ok(report.includes(beadId), `audit report should trace ${beadId}`);
}

console.log("skill quality audit report covers required source, surfaces, criteria, and blockers");
