import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = await readFile(path.join(root, "plugin", "docs", "product-contract.md"), "utf8");

const requiredPhrases = [
  "Codex plugin",
  "What You Give SEAL",
  "A repository",
  "A Markdown plan",
  "Existing `.seal` artifacts",
  "What SEAL Gives Back",
  "MAP",
  "IMPACT",
  "PROVE",
  "VALIDATE",
  "LAUNCH",
  "Why Trust It",
  "source authority",
  "Unknowns become visible gaps",
  "File coverage checks",
  "Reference checks",
  "zero hidden technical debt",
  "no untraced rework",
  "does not promise zero technical debt",
  "ChatGPT App or marketplace adapter is a later distribution layer"
];

for (const phrase of requiredPhrases) {
  assert.ok(contract.includes(phrase), `product contract should include: ${phrase}`);
}

assert.match(
  contract,
  /for people who need a project plan or codebase to become inspectable/i,
  "product contract should say who SEAL is for in plain language"
);
assert.match(
  contract,
  /It must not hide inferred content as fact/i,
  "product contract should preserve SEAL authority rules"
);
assert.match(
  contract,
  /claim to evidence to gap/i,
  "product contract should explain why users can trust the output"
);

for (const forbidden of [
  /guarantees? correctness/i,
  /(?<!not )promises? zero technical debt/i,
  /ChatGPT App is the P0 surface/i
]) {
  assert.equal(forbidden.test(contract), false, `product contract should avoid unsupported claim: ${forbidden}`);
}

console.log("Product contract answers audience, inputs, outputs, and trust model without unsupported claims.");
