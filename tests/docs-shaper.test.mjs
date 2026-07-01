import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { validateArtifact } from "../src/artifacts/schema-registry.mjs";
import { writeAiDocs, writeHumanDocs } from "../src/docs/shaper.mjs";
import { invokeSeal } from "../src/invocation/invoke.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "seal-docs-shaper-"));
const target = path.join(tempRoot, "repo-tiny");

async function readYaml(relativePath) {
  return YAML.parse(await readFile(path.join(target, relativePath), "utf8"));
}

try {
  await cp(path.join(root, "tests", "fixtures", "repo-tiny"), target, { recursive: true });
  await invokeSeal(target);

  const human = await writeHumanDocs(target);
  assert.equal((await stat(human.outputPath)).isFile(), true);
  assert.match(human.proposal, /# SEAL Documentation Proposal/);
  assert.match(human.proposal, /## README Quick Orientation/);
  assert.match(human.proposal, /## Architecture From MAP And TRACE/);
  assert.match(human.proposal, /## Testing And Proof/);
  assert.match(human.proposal, /## Known Gaps And Debt/);
  assert.match(human.proposal, /<!-- seal-claim id="doc.quick-orientation"/);
  assert.equal(human.docsDebt.length, 0, "proposal claims should trace to canonical MAP records");

  const ai = await writeAiDocs(target);
  assert.equal((await stat(ai.outputPath)).isFile(), true);
  assert.equal((await stat(ai.contextPackPath)).isFile(), true);
  assert.equal((await stat(ai.reportPath)).isFile(), true);
  const aiDocs = await readYaml(".seal/ai-docs/context.yaml");
  assert.equal(aiDocs.mode, "ai");
  assert.equal(aiDocs.separation.human_docs, ".seal/reports/docs-proposal.md");
  assert.equal(aiDocs.separation.machine_docs, ".seal/ai-docs/context.yaml");
  assert.ok(Array.isArray(aiDocs.records.components));
  assert.ok(Array.isArray(aiDocs.records.files));
  assert.equal(JSON.stringify(aiDocs).includes("# SEAL Documentation Proposal"), false, "AI docs must not embed human prose");

  const readmePath = path.join(target, "README.md");
  await writeFile(readmePath, ["# Tiny", "", "<!-- SEAL:DOCS:BEGIN -->", "old generated docs", "<!-- SEAL:DOCS:END -->", "", "Manual note."].join("\n"), "utf8");
  const bounded = await writeHumanDocs(target, { write: true, target: "README.md" });
  assert.equal(bounded.writeResult.mode, "bounded-marker");
  const readme = await readFile(readmePath, "utf8");
  assert.match(readme, /# SEAL Documentation Proposal/);
  assert.match(readme, /Manual note\./);
  assert.equal(readme.includes("old generated docs"), false);

  await writeFile(
    path.join(target, "docs-claim.md"),
    '<!-- seal-claim id="doc.bad" refs="missing.canonical.id" -->Unsupported claim<!-- /seal-claim -->',
    "utf8"
  );
  const unsupported = await writeHumanDocs(target, {
    write: true,
    target: "docs-claim.md",
    approveTarget: true
  });
  assert.equal(unsupported.writeResult.mode, "approved-target");
  const debt = await readYaml(".seal/debt.yaml");
  const result = await validateArtifact("debt", debt);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));

  const cliHuman = spawnSync(process.execPath, [path.join(root, "src", "cli", "seal.mjs"), "docs", target], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(cliHuman.status, 0, cliHuman.stderr);
  assert.match(cliHuman.stdout, /wrote human docs proposal/);

  const cliAi = spawnSync(process.execPath, [path.join(root, "src", "cli", "seal.mjs"), "docs", "ai", target], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(cliAi.status, 0, cliAi.stderr);
  assert.match(cliAi.stdout, /wrote ai docs/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Docs shaper separates human proposals, bounded writes, AI context, and documentation debt.");
