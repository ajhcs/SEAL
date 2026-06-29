import Ajv2020 from "ajv/dist/2020.js";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pluginRoot = path.join(root, "plugin");

export async function loadPluginManifest() {
  return JSON.parse(await readFile(path.join(pluginRoot, "manifest.json"), "utf8"));
}

export async function validatePluginManifest(manifest = null) {
  const loadedManifest = manifest ?? await loadPluginManifest();
  const schema = JSON.parse(
    await readFile(path.join(pluginRoot, "schemas", "plugin-manifest.schema.json"), "utf8")
  );
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const schemaValid = validate(loadedManifest);
  const errors = schemaValid ? [] : validate.errors.map((error) => ({
    path: error.instancePath || "/",
    message: error.message,
    schemaPath: error.schemaPath
  }));

  if (loadedManifest.version !== packageJson.version) {
    errors.push({
      path: "/version",
      message: `must match package.json version ${packageJson.version}`,
      schemaPath: "package.json#/version"
    });
  }

  if (loadedManifest.packageName !== packageJson.name) {
    errors.push({
      path: "/packageName",
      message: `must match package.json name ${packageJson.name}`,
      schemaPath: "package.json#/name"
    });
  }

  for (const command of loadedManifest.entrypoints?.commands ?? []) {
    if (!packageJson.bin?.[command.packageBin]) {
      errors.push({
        path: `/entrypoints/commands/${command.id}/packageBin`,
        message: `must reference an existing package.json bin named ${command.packageBin}`,
        schemaPath: "package.json#/bin"
      });
    } else {
      const packageBinPath = normalizeManifestPath(command.path);
      const declaredBinPath = normalizeManifestPath(packageJson.bin[command.packageBin]);
      if (packageBinPath !== declaredBinPath) {
        errors.push({
          path: `/entrypoints/commands/${command.id}/path`,
          message: `must match package.json bin path ${packageJson.bin[command.packageBin]}`,
          schemaPath: "package.json#/bin"
        });
      }
    }
  }

  const manifestBins = new Set((loadedManifest.entrypoints?.commands ?? []).map((command) => command.packageBin));
  for (const packageBin of Object.keys(packageJson.bin ?? {})) {
    if (!manifestBins.has(packageBin)) {
      errors.push({
        path: "/entrypoints/commands",
        message: `must expose package.json bin ${packageBin}`,
        schemaPath: "package.json#/bin"
      });
    }
  }

  await checkReferencedPaths(loadedManifest, errors);

  return {
    valid: errors.length === 0,
    errors
  };
}

async function checkReferencedPaths(manifest, errors) {
  const pathChecks = [
    ...(manifest.entrypoints?.skills ?? []).map((entry) => ({ ...entry, base: pluginRoot, group: "skills" })),
    ...(manifest.entrypoints?.commands ?? []).map((entry) => ({ ...entry, base: pluginRoot, group: "commands" })),
    ...(manifest.artifacts?.schemas ?? []).map((entry) => ({ ...entry, base: pluginRoot, group: "schemas" })),
    ...(manifest.artifacts?.fixtures ?? []).map((entry) => ({ ...entry, base: pluginRoot, group: "fixtures" })),
    ...(manifest.docs ?? []).map((entry) => ({ ...entry, base: pluginRoot, group: "docs" })),
    ...(manifest.sourceAuthority ?? []).map((entry) => ({ ...entry, base: root, group: "sourceAuthority" }))
  ];

  for (const entry of pathChecks) {
    const absolutePath = path.resolve(entry.base, entry.path);
    if (!isInsideRoot(absolutePath)) {
      errors.push({
        path: `/${entry.group}/${entry.id ?? entry.path}/path`,
        message: "must stay inside the SEAL workspace",
        schemaPath: "local-reference-integrity"
      });
      continue;
    }

    try {
      const result = await stat(absolutePath);
      if (!result.isFile() && !result.isDirectory()) {
        errors.push({
          path: `/${entry.group}/${entry.id ?? entry.path}/path`,
          message: "must reference a file or directory",
          schemaPath: "local-reference-integrity"
        });
      }
    } catch {
      errors.push({
        path: `/${entry.group}/${entry.id ?? entry.path}/path`,
        message: `must reference an existing path: ${entry.path}`,
        schemaPath: "local-reference-integrity"
      });
    }
  }

  await access(path.join(pluginRoot, "manifest.json"));
}

function normalizeManifestPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\.\.\//, "");
}

function isInsideRoot(absolutePath) {
  const relativePath = path.relative(root, absolutePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}
