import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(root, "src");
const allowedUnkeyedFiles = new Set([
  "src/artifacts/store.mjs"
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
      files.push(fullPath);
    }
  }
  return files;
}

function callSnippet(text, index) {
  const openIndex = text.indexOf("(", index);
  let depth = 0;
  for (let cursor = openIndex; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(index, cursor + 1);
    }
  }
  return text.slice(index);
}

const violations = [];
for (const filePath of await walk(srcRoot)) {
  const relativePath = path.relative(root, filePath).replaceAll(path.sep, "/");
  if (allowedUnkeyedFiles.has(relativePath)) {
    continue;
  }
  const text = await readFile(filePath, "utf8");
  let index = text.indexOf("readCanonicalSet(");
  while (index !== -1) {
    const snippet = callSnippet(text, index);
    if (!/\bkeys\s*:/.test(snippet)) {
      const line = text.slice(0, index).split(/\r?\n/).length;
      violations.push(`${relativePath}:${line}`);
    }
    index = text.indexOf("readCanonicalSet(", index + 1);
  }
}

assert.deepEqual(violations, [], "production readCanonicalSet calls must declare keys");

console.log("ArtifactStore callers declare explicit readCanonicalSet keys.");
