import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const defaultIgnoredDirectories = new Set([".git", ".seal", "node_modules"]);

async function loadIgnoreRules(rootDir) {
  try {
    const text = await readFile(path.join(rootDir, ".gitignore"), "utf8");
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .filter((line) => !line.startsWith("!"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*");
  return new RegExp(`^${escaped}$`);
}

function isIgnored(relativePath, isDirectory, rules) {
  const normalized = relativePath.replaceAll("\\", "/");
  const name = normalized.split("/").pop();

  if (isDirectory && defaultIgnoredDirectories.has(name)) {
    return true;
  }

  return rules.some((rule) => {
    const directoryRule = rule.endsWith("/");
    const cleanRule = rule.replace(/^\/+/, "").replace(/\/+$/, "");

    if (!cleanRule) {
      return false;
    }
    if (directoryRule) {
      return normalized === cleanRule || normalized.startsWith(`${cleanRule}/`) || name === cleanRule;
    }
    if (cleanRule.includes("*")) {
      return globToRegExp(cleanRule).test(normalized) || globToRegExp(cleanRule).test(name);
    }
    if (cleanRule.includes("/")) {
      return normalized === cleanRule || normalized.startsWith(`${cleanRule}/`);
    }
    return name === cleanRule;
  });
}

async function walkDirectory(rootDir, currentDir, rules, files) {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath).replaceAll("\\", "/");

    if (isIgnored(relativePath, entry.isDirectory(), rules)) {
      continue;
    }
    if (entry.isDirectory()) {
      await walkDirectory(rootDir, absolutePath, rules, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(relativePath);
    }
  }
}

export async function listInventoryFiles(rootDir) {
  const rules = await loadIgnoreRules(rootDir);
  const files = [];
  await walkDirectory(rootDir, rootDir, rules, files);
  return files.sort((left, right) => left.localeCompare(right));
}
