import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const ALLOWED_CODEX_MANIFEST_KEYS = new Set([
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "skills",
  "interface"
]);
const REQUIRED_INTERFACE_KEYS = [
  "displayName",
  "shortDescription",
  "longDescription",
  "developerName",
  "category",
  "capabilities",
  "defaultPrompt",
  "brandColor"
];

export function defaultPluginCreatorValidatorPath() {
  return path.join(os.homedir(), ".codex", "skills", ".system", "plugin-creator", "scripts", "validate_plugin.py");
}

export async function validateCodexPluginIngestion(pluginRoot, options = {}) {
  const validatorPath = options.validatorPath ?? defaultPluginCreatorValidatorPath();

  if (!options.useBuiltin && existsSync(validatorPath)) {
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
      throw wrapValidationError(error, pluginRoot, validatorPath);
    }
  }

  try {
    const diagnostics = await validateWithBuiltinChecks(pluginRoot);
    return {
      valid: true,
      validatorPath: "builtin",
      stdout: `Plugin validation passed: ${pluginRoot}\n${diagnostics.join("\n")}\n`,
      stderr: ""
    };
  } catch (error) {
    throw wrapValidationError(error, pluginRoot, "builtin");
  }
}

async function validateWithBuiltinChecks(pluginRoot) {
  const diagnostics = [];
  const errors = [];
  const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
  const manifest = await readJson(manifestPath, "missing `.codex-plugin/plugin.json`", errors);

  if (manifest) {
    validateCodexManifest(pluginRoot, manifest, errors);
    await validateDeclaredPaths(pluginRoot, manifest, errors);
    diagnostics.push("Validated .codex-plugin/plugin.json");
  }

  await validateSkills(pluginRoot, errors);
  diagnostics.push("Validated packaged skills");

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return diagnostics;
}

function validateCodexManifest(pluginRoot, manifest, errors) {
  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_CODEX_MANIFEST_KEYS.has(key)) {
      errors.push(`Additional properties are not allowed: ${key}`);
    }
  }

  for (const key of ["name", "version", "description", "author", "skills", "interface"]) {
    if (!(key in manifest)) {
      errors.push(`plugin.json missing required field: ${key}`);
    }
  }

  if (typeof manifest.version !== "string" || !SEMVER_PATTERN.test(manifest.version)) {
    errors.push("version must be semver compatible");
  }

  if (JSON.stringify(manifest).includes("[TODO:")) {
    errors.push("manifest must not contain [TODO: placeholders");
  }

  const interfaceBlock = manifest.interface ?? {};
  for (const key of REQUIRED_INTERFACE_KEYS) {
    if (!(key in interfaceBlock)) {
      errors.push(`interface missing required field: ${key}`);
    }
  }

  for (const prompt of interfaceBlock.defaultPrompt ?? []) {
    if (typeof prompt !== "string" || prompt.length > 128) {
      errors.push("interface.defaultPrompt entries must be strings of at most 128 characters");
    }
  }
}

async function validateDeclaredPaths(pluginRoot, manifest, errors) {
  for (const field of ["skills", "hooks", "mcpServers", "apps"]) {
    if (!(field in manifest)) {
      continue;
    }
    const target = path.resolve(pluginRoot, manifest[field]);
    if (!isInside(pluginRoot, target)) {
      errors.push(`${field} must stay inside plugin root`);
      continue;
    }
    try {
      await stat(target);
    } catch {
      errors.push(`${field} references missing path: ${manifest[field]}`);
    }
  }
}

async function validateSkills(pluginRoot, errors) {
  const skillsRoot = path.join(pluginRoot, "skills");
  let entries;
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch {
    errors.push("skills directory is missing");
    return;
  }

  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const skillRoot = path.join(skillsRoot, entry.name);
    const skillPath = path.join(skillRoot, "SKILL.md");
    let skillText;
    try {
      skillText = await readFile(skillPath, "utf8");
    } catch {
      errors.push(`missing SKILL.md for skill: ${entry.name}`);
      continue;
    }

    const frontmatter = parseFrontmatter(skillText, entry.name, errors);
    if (!frontmatter) {
      continue;
    }
    if (frontmatter.name !== entry.name) {
      errors.push(`frontmatter name must match skill directory: ${entry.name}`);
    }
    if (typeof frontmatter.description !== "string" || frontmatter.description.length < 20) {
      errors.push(`frontmatter description is required for skill: ${entry.name}`);
    }
    if (frontmatter["disable-model-invocation"] === true || frontmatter.disable_model_invocation === true) {
      errors.push("disable-model-invocation is not allowed for packaged Codex skills");
    }

    await validateAgentFile(path.join(skillRoot, "agents", "openai.yaml"), errors);
  }
}

async function validateAgentFile(agentPath, errors) {
  let agentText;
  try {
    agentText = await readFile(agentPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  const agent = YAML.parse(agentText);
  const keys = Object.keys(agent ?? {}).sort();
  if (keys.length !== 1 || keys[0] !== "interface") {
    errors.push("agent openai.yaml has unsupported fields; only interface is allowed");
  }
  const interfaceBlock = agent?.interface ?? {};
  for (const key of ["display_name", "short_description", "default_prompt"]) {
    if (typeof interfaceBlock[key] !== "string") {
      errors.push(`agent interface.${key} is required`);
    }
  }
}

function parseFrontmatter(markdown, label, errors) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    errors.push(`frontmatter metadata with name and description is required for skill: ${label}`);
    return null;
  }
  return YAML.parse(match[1]);
}

async function readJson(filePath, missingMessage, errors) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      errors.push(missingMessage);
      return null;
    }
    throw error;
  }
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function wrapValidationError(error, pluginRoot, validatorPath) {
  const diagnostics = `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`.trim();
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
  return wrapped;
}
