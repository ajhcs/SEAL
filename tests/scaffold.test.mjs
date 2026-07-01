import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const requiredPaths = [
  "package.json",
  "README.md",
  "plugin/README.md",
  "plugin/manifest.json",
  "plugin/.codex-plugin/plugin.json",
  "plugin/skills/seal/SKILL.md",
  "plugin/schemas/plugin-manifest.schema.json",
  "plugin/schemas/ontology.schema.json",
  "plugin/schemas/map.schema.json",
  "plugin/schemas/impact.schema.json",
  "plugin/schemas/proof.schema.json",
  "plugin/schemas/evidence-index.schema.json",
  "plugin/schemas/debt.schema.json",
  "plugin/schemas/fly.schema.json",
  "plugin/fixtures/minimal/.seal/ontology.yaml",
  "plugin/fixtures/minimal/.seal/map.yaml",
  "plugin/fixtures/minimal/.seal/impacts/IMPACT-fixture.yaml",
  "plugin/fixtures/minimal/.seal/proof.yaml",
  "plugin/fixtures/minimal/.seal/evidence/index.yaml",
  "plugin/docs/product-contract.md",
  "plugin/docs/glossary.md",
  "plugin/docs/example-workflows.md",
  "plugin/docs/release-checklist.md",
  "plugin/docs/migration-policy.md",
  "plugin/docs/marketplace-assets.md",
  "plugin/docs/mcp-tool-contract.md",
  "plugin/docs/app-output-schemas.md",
  "plugin/docs/adapter-security-privacy.md",
  "plugin/docs/app-submission-readiness.md",
  "tests/fixtures/full-workflow/pass/.seal/map.yaml",
  "tests/fixtures/full-workflow/pass/.seal/impacts/IMPACT-pass.yaml",
  "tests/fixtures/full-workflow/pass/.seal/proof.yaml",
  "tests/fixtures/full-workflow/pass/.seal/evidence/index.yaml",
  "tests/fixtures/full-workflow/pass/.seal/ontology.yaml",
  "tests/fixtures/full-workflow/fail/.seal/map.yaml",
  "tests/fixtures/full-workflow/fail/.seal/impacts/IMPACT-fail.yaml",
  "tests/fixtures/full-workflow/fail/.seal/proof.yaml",
  "tests/fixtures/full-workflow/fail/.seal/evidence/index.yaml",
  "tests/fixtures/full-workflow/fail/.seal/ontology.yaml",
  "plugin/docs/first-run.md",
  "plugin/docs/artifact-templates.md",
  "plugin/docs/reference-model.md",
  "plugin/docs/source-authority.md",
  "plugin/docs/proof-taxonomy.md",
  "plugin/docs/gate-criteria.md",
  "plugin/docs/gate-policy.md",
  "plugin/docs/launch-readiness-report.md",
  "plugin/docs/plugin-smoke.md",
  "plugin/docs/plugin-root-layout.md",
  ".seal/reports/skill-quality-audit.md",
  ".seal/ontology.yaml",
  "src/cli/seal-context-pack.mjs",
  "src/cli/seal-dashboard.mjs",
  "src/cli/seal-gap-review.mjs",
  "src/cli/seal-launch-report.mjs",
  "src/artifacts/authority.mjs",
  "src/artifacts/ontology.mjs",
  "src/artifacts/versions.mjs",
  "src/gates/criteria.mjs",
  "src/gates/policy.mjs",
  "src/cli/seal-impact.mjs",
  "src/cli/seal-invoke.mjs",
  "src/cli/seal-map-views.mjs",
  "src/cli/seal-proof-report.mjs",
  "src/cli/seal-validate.mjs",
  "src/context/pack.mjs",
  "src/docs/shaper.mjs",
  "src/debt/register.mjs",
  "src/impact/change-scope.mjs",
  "src/ingestion/gap-review.mjs",
  "src/ingestion/markdown-plan.mjs",
  "src/invocation/invoke.mjs",
  "src/plugin/codex-validator.mjs",
  "src/launch/readiness-levels.mjs",
  "src/launch/readiness-report.mjs",
  "src/map/render-views.mjs",
  "src/proof/evidence-store.mjs",
  "src/proof/gap-report.mjs",
  "src/rigor/profiles.mjs",
  "src/validation/file-coverage.mjs",
  "src/validation/validate.mjs",
  "src/views/dashboard.mjs",
  "tests/authority.test.mjs",
  "tests/artifact-versions.test.mjs",
  "tests/templates.test.mjs",
  "tests/map-rendered-views.test.mjs",
  "tests/dashboard-view.test.mjs",
  "tests/repo-ingestion.test.mjs",
  "tests/debt-register.test.mjs",
  "tests/file-coverage.test.mjs",
  "tests/impact-change-scope.test.mjs",
  "tests/impact-proof-obligations.test.mjs",
  "tests/context-pack.test.mjs",
  "tests/docs-shaper.test.mjs",
  "tests/rigor-profiles.test.mjs",
  "tests/proof-gap-report.test.mjs",
  "tests/closure-evidence.test.mjs",
  "tests/ingestion-gap-review.test.mjs",
  "tests/markdown-ingestion.test.mjs",
  "tests/skill-quality-audit-report.test.mjs",
  "tests/evidence-store.test.mjs",
  "tests/fly-ontology-actions.test.mjs",
  "tests/ontology-rerun-semantics.test.mjs",
  "tests/codex-plugin-root-layout.test.mjs",
  "tests/codex-plugin-json-manifest.test.mjs",
  "tests/codex-plugin-skill-agent-validation.test.mjs",
  "tests/codex-plugin-ingestion-smoke.test.mjs",
  "tests/gate-criteria.test.mjs",
  "tests/gate-policy.test.mjs",
  "tests/launch-readiness-report.test.mjs",
  "tests/full-workflow-fixtures.test.mjs",
  "tests/product-contract.test.mjs",
  "tests/glossary.test.mjs",
  "tests/personas.test.mjs",
  "tests/gstack-bridge.test.mjs",
  "tests/first-run-docs.test.mjs",
  "tests/example-workflows-docs.test.mjs",
  "tests/release-checklist-docs.test.mjs",
  "tests/migration-policy-docs.test.mjs",
  "tests/marketplace-assets-docs.test.mjs",
  "tests/mcp-tool-contract-docs.test.mjs",
  "tests/app-output-schemas-docs.test.mjs",
  "tests/adapter-security-privacy-docs.test.mjs",
  "tests/app-submission-readiness-docs.test.mjs",
  "tests/fixtures/markdown-plans/sparse.md",
  "tests/fixtures/markdown-plans/medium.md",
  "tests/fixtures/markdown-plans/detailed.md",
  "tests/fixtures/markdown-plans/gstack-style.md",
  "tests/invocation.test.mjs",
  "tests/plugin-smoke.test.mjs",
  "tests/validation.test.mjs"
];

const forbiddenPathPatterns = [
  /(^|\/)temp(\/|$)/i,
  /(^|\/)tmp(\/|$)/i,
  /extraction/i,
  /archive/i,
  /C:\\Users\\/i,
  /OneDrive/i
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === ".beads" || entry.name === "node_modules") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

for (const relativePath of requiredPaths) {
  const absolutePath = path.join(root, relativePath);
  assert.equal((await stat(absolutePath)).isFile(), true, `${relativePath} should exist`);
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
assert.equal(packageJson.private, true, "package should stay private until release packaging is explicit");
assert.equal(
  packageJson.scripts.test,
  "node tests/scaffold.test.mjs && node tests/schema.test.mjs && node tests/reference-integrity.test.mjs && node tests/authority.test.mjs && node tests/artifact-versions.test.mjs && node tests/templates.test.mjs && node tests/inventory.test.mjs && node tests/map-rendered-views.test.mjs && node tests/dashboard-view.test.mjs && node tests/repo-ingestion.test.mjs && node tests/debt-register.test.mjs && node tests/file-coverage.test.mjs && node tests/impact-change-scope.test.mjs && node tests/impact-proof-obligations.test.mjs && node tests/context-pack.test.mjs && node tests/docs-shaper.test.mjs && node tests/rigor-profiles.test.mjs && node tests/proof-gap-report.test.mjs && node tests/ingestion-gap-review.test.mjs && node tests/markdown-ingestion.test.mjs && node tests/skill-routing.test.mjs && node tests/skill-quality-audit-report.test.mjs && node tests/proof-taxonomy.test.mjs && node tests/evidence-store.test.mjs && node tests/fly-ontology-actions.test.mjs && node tests/ontology-rerun-semantics.test.mjs && node tests/codex-plugin-root-layout.test.mjs && node tests/codex-plugin-json-manifest.test.mjs && node tests/codex-plugin-skill-agent-validation.test.mjs && node tests/codex-plugin-ingestion-smoke.test.mjs && node tests/gate-criteria.test.mjs && node tests/gate-policy.test.mjs && node tests/launch-readiness-report.test.mjs && node tests/closure-evidence.test.mjs && node tests/full-workflow-fixtures.test.mjs && node tests/product-contract.test.mjs && node tests/glossary.test.mjs && node tests/personas.test.mjs && node tests/gstack-bridge.test.mjs && node tests/first-run-docs.test.mjs && node tests/example-workflows-docs.test.mjs && node tests/release-checklist-docs.test.mjs && node tests/migration-policy-docs.test.mjs && node tests/marketplace-assets-docs.test.mjs && node tests/mcp-tool-contract-docs.test.mjs && node tests/app-output-schemas-docs.test.mjs && node tests/adapter-security-privacy-docs.test.mjs && node tests/app-submission-readiness-docs.test.mjs && node tests/plugin-manifest.test.mjs && node tests/invocation.test.mjs && node tests/rc-command-surface.test.mjs && node tests/plugin-smoke.test.mjs && node tests/validation.test.mjs"
);

for (const schemaName of [
  "plugin-manifest.schema.json",
  "ontology.schema.json",
  "map.schema.json",
  "impact.schema.json",
  "proof.schema.json",
  "evidence-index.schema.json",
  "debt.schema.json",
  "fly.schema.json"
]) {
  const schema = JSON.parse(await readFile(path.join(root, "plugin", "schemas", schemaName), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(schema.required.length > 0, `${schemaName} must define required fields`);
}

const allFiles = await walk(root);
for (const filePath of allFiles) {
  const relativePath = path.relative(root, filePath).replaceAll(path.sep, "/");
  for (const pattern of forbiddenPathPatterns) {
    assert.equal(pattern.test(relativePath), false, `${relativePath} looks like stray temp or personal path`);
  }
}

console.log(`Scaffold check passed for ${requiredPaths.length} required files.`);
