import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = await readFile(path.join(root, "plugin", "docs", "app-output-schemas.md"), "utf8");

for (const schemaKind of [
  "map_summary_card",
  "impact_summary_card",
  "proof_summary_card",
  "launch_readiness_card",
  "context_pack_card",
  "validation_result_card"
]) {
  assert.match(doc, new RegExp(`\`${schemaKind}\``), `${schemaKind} should be documented`);
}

for (const sharedField of [
  "schema_version",
  "kind",
  "title",
  "status",
  "summary",
  "primary_action",
  "sections",
  "trace"
]) {
  assert.match(doc, new RegExp(`\`${sharedField}\``), `${sharedField} should be part of the shared card shape`);
}

for (const status of [
  "pass",
  "warn",
  "unknown",
  "blocked",
  "fail",
  "info"
]) {
  assert.match(doc, new RegExp(`\`${status}\``), `${status} should be listed as a display status`);
}

for (const requiredPhrase of [
  "derived from existing SEAL artifacts",
  "must not hide blockers, unknowns, evidence limitations, approval state, or source authority",
  "ChatGPT App availability",
  "marketplace installation",
  "replacement of human launch approval",
  "The card status must follow the gate decision first",
  "SRL explains maturity but does not override gates",
  "Do not include bulk source files",
  "Preserve `authority_state`, `approval_state`, and `confidence`",
  "Use `unknown` when SEAL lacks evidence or authority"
]) {
  assert.ok(doc.includes(requiredPhrase), `App output schemas should include phrase: ${requiredPhrase}`);
}

for (const commandName of [
  "seal-invoke",
  "seal-map-views",
  "seal-impact",
  "seal-proof-report",
  "seal-launch-report",
  "seal-context-pack",
  "seal-validate"
]) {
  assert.match(doc, new RegExp(commandName), `${commandName} should be named as a source command`);
}

for (const traceRef of [
  "map.gap",
  "impact.proof_required",
  "proof.claim",
  "evidence",
  "gate.policy",
  "validation"
]) {
  assert.match(doc, new RegExp(traceRef.replace(".", "\\.")), `${traceRef} should be included in trace requirements`);
}

console.log("App output schemas docs check passed.");
