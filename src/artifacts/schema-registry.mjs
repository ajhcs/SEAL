import Ajv2020 from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const schemaRoot = path.join(root, "plugin", "schemas");

export const artifactSchemas = Object.freeze({
  map: {
    schemaPath: "map.schema.json",
    artifactPath: ".seal/map.yaml"
  },
  impact: {
    schemaPath: "impact.schema.json",
    artifactPath: ".seal/impacts/IMPACT-*.yaml"
  },
  proof: {
    schemaPath: "proof.schema.json",
    artifactPath: ".seal/proof.yaml"
  },
  evidenceIndex: {
    schemaPath: "evidence-index.schema.json",
    artifactPath: ".seal/evidence/index.yaml"
  },
  debt: {
    schemaPath: "debt.schema.json",
    artifactPath: ".seal/debt.yaml"
  }
});

export async function loadSchemaRegistry() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validators = {};

  for (const [artifactType, entry] of Object.entries(artifactSchemas)) {
    const schema = JSON.parse(await readFile(path.join(schemaRoot, entry.schemaPath), "utf8"));
    validators[artifactType] = ajv.compile(schema);
  }

  return validators;
}

export async function validateArtifact(artifactType, artifact) {
  const validators = await loadSchemaRegistry();
  const validator = validators[artifactType];

  if (!validator) {
    throw new Error(`Unknown SEAL artifact type: ${artifactType}`);
  }

  const valid = validator(artifact);
  return {
    valid,
    errors: valid ? [] : validator.errors.map((error) => ({
      path: error.instancePath || "/",
      message: error.message,
      schemaPath: error.schemaPath
    })),
    rawErrors: valid ? [] : validator.errors
  };
}

export async function parseYamlArtifact(filePath) {
  return YAML.parse(await readFile(filePath, "utf8"));
}
