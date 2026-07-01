import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function defaultPluginCreatorValidatorPath() {
  return path.join(os.homedir(), ".codex", "skills", ".system", "plugin-creator", "scripts", "validate_plugin.py");
}

export async function validateCodexPluginIngestion(pluginRoot, options = {}) {
  const validatorPath = options.validatorPath ?? defaultPluginCreatorValidatorPath();

  if (!existsSync(validatorPath)) {
    throw new Error(`Codex plugin ingestion validator missing: ${validatorPath}`);
  }

  try {
    const result = await execFileAsync(options.pythonBin ?? "python", [validatorPath, pluginRoot], {
      cwd: options.cwd ?? path.dirname(pluginRoot)
    });
    return {
      valid: true,
      validatorPath,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    const diagnostics = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    const message = [
      "Codex plugin ingestion validation failed.",
      `Plugin root: ${pluginRoot}`,
      `Validator: ${validatorPath}`,
      diagnostics
    ].filter(Boolean).join("\n");
    const wrapped = new Error(message);
    wrapped.cause = error;
    wrapped.validatorPath = validatorPath;
    wrapped.diagnostics = diagnostics;
    throw wrapped;
  }
}
