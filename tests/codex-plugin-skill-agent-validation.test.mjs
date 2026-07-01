import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { validateCodexPluginIngestion } from "../src/plugin/codex-validator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(root, "plugin");
const skillsRoot = path.join(pluginRoot, "skills");

async function skillDirectories(rootPath = skillsRoot) {
  const entries = await readdir(rootPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(rootPath, entry.name)).sort();
}

function parseFrontmatter(markdown, label) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, `${label} should have closed YAML frontmatter`);
  return YAML.parse(match[1]);
}

async function validatePlugin(pluginPath) {
  return validateCodexPluginIngestion(pluginPath, { cwd: root, useBuiltin: true });
}

async function assertValidatorFailure(label, mutate, expectedPattern) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "seal-plugin-skills-"));
  const tempPlugin = path.join(tempRoot, "plugin");
  try {
    await cp(pluginRoot, tempPlugin, { recursive: true });
    await mutate(tempPlugin);
    await assert.rejects(
      validatePlugin(tempPlugin),
      (error) => {
        assert.match(error.message, expectedPattern, label);
        return true;
      },
      label
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

await validatePlugin(pluginRoot);

const skillDirs = await skillDirectories();
assert.deepEqual(
  skillDirs.map((directory) => path.basename(directory)),
  ["seal", "seal-impact", "seal-map", "seal-plan", "seal-proof"]
);

for (const directory of skillDirs) {
  const skillName = path.basename(directory);
  const skillText = await readFile(path.join(directory, "SKILL.md"), "utf8");
  const frontmatter = parseFrontmatter(skillText, skillName);
  assert.equal(frontmatter.name, skillName);
  assert.equal(typeof frontmatter.description, "string");
  assert.ok(frontmatter.description.length > 20);
  assert.notEqual(frontmatter["disable-model-invocation"], true);
  assert.notEqual(frontmatter.disable_model_invocation, true);
  assert.equal(/\/seal\b/.test(skillText), false, `${skillName} must not claim an untested /seal slash command path`);

  try {
    const agentText = await readFile(path.join(directory, "agents", "openai.yaml"), "utf8");
    const agent = YAML.parse(agentText);
    assert.deepEqual(Object.keys(agent).sort(), ["interface"]);
    assert.equal(typeof agent.interface.display_name, "string");
    assert.equal(typeof agent.interface.short_description, "string");
    assert.equal(typeof agent.interface.default_prompt, "string");
    assert.equal(agent.interface.default_prompt.includes(`$${skillName}`), true);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

await assertValidatorFailure(
  "missing skill frontmatter should fail validation",
  async (pluginPath) => {
    const skillPath = path.join(pluginPath, "skills", "seal-map", "SKILL.md");
    const text = await readFile(skillPath, "utf8");
    await writeFile(skillPath, text.replace(/^---\n[\s\S]*?\n---\n/, ""), "utf8");
  },
  /frontmatter|metadata|name|description/
);

await assertValidatorFailure(
  "disabled model invocation should fail validation",
  async (pluginPath) => {
    const skillPath = path.join(pluginPath, "skills", "seal-map", "SKILL.md");
    const text = await readFile(skillPath, "utf8");
    await writeFile(skillPath, text.replace("description:", "disable-model-invocation: true\ndescription:"), "utf8");
  },
  /disable-model-invocation|disable_model_invocation|model invocation/
);

await assertValidatorFailure(
  "unsupported agent field should fail validation",
  async (pluginPath) => {
    const agentPath = path.join(pluginPath, "skills", "seal-map", "agents", "openai.yaml");
    const agent = YAML.parse(await readFile(agentPath, "utf8"));
    agent.unsupported = { value: true };
    await writeFile(agentPath, YAML.stringify(agent), "utf8");
  },
  /unsupported|Additional properties|agent|openai/
);

console.log("Codex plugin skills and agent metadata pass validation and reject malformed packaged copies.");
