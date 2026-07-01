import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultPluginCreatorValidatorPath,
  validateCodexPluginIngestion
} from "../src/plugin/codex-validator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(root, "plugin");

const validResult = await validateCodexPluginIngestion(pluginRoot, { cwd: root });
assert.equal(validResult.valid, true);
assert.equal(
  [defaultPluginCreatorValidatorPath(), "builtin"].includes(validResult.validatorPath),
  true,
  "validator should use plugin-creator when available and fall back to built-in ingestion checks"
);
assert.match(validResult.stdout, /Plugin validation passed/);

const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-codex-ingestion-"));
try {
  const tempPlugin = path.join(tempRoot, "plugin");
  await cp(pluginRoot, tempPlugin, { recursive: true });
  await rm(path.join(tempPlugin, ".codex-plugin", "plugin.json"));
  await assert.rejects(
    validateCodexPluginIngestion(tempPlugin, { cwd: root }),
    (error) => {
      assert.match(error.message, /Codex plugin ingestion validation failed/);
      assert.match(error.message, /missing `.codex-plugin\/plugin\.json`/);
      assert.match(error.message, /Plugin root:/);
      assert.match(error.message, /Validator:/);
      return true;
    }
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Codex plugin ingestion smoke wrapper labels validator failures.");
