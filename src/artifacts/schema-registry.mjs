import Ajv2020 from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { validateOntologyContract } from "./ontology.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const schemaRoot = path.join(root, "plugin", "schemas");

export const artifactSchemas = Object.freeze({
  plan: {
    schemaPath: "plan.schema.json",
    artifactPath: ".seal/plan.yaml"
  },
  ontology: {
    schemaPath: "ontology.schema.json",
    artifactPath: ".seal/ontology.yaml"
  },
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
  trace: {
    schemaPath: "trace.schema.json",
    artifactPath: ".seal/trace.yaml"
  },
  sources: {
    schemaPath: "sources.schema.json",
    artifactPath: ".seal/sources.yaml"
  },
  evidenceIndex: {
    schemaPath: "evidence-index.schema.json",
    artifactPath: ".seal/evidence/index.yaml"
  },
  debt: {
    schemaPath: "debt.schema.json",
    artifactPath: ".seal/debt.yaml"
  },
  fly: {
    schemaPath: "fly.schema.json",
    artifactPath: ".seal/fly/FLY-*.yaml"
  },
  contextPack: {
    schemaPath: "context-pack.schema.json",
    artifactPath: ".seal/context-pack.yaml"
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
  const semanticResult = valid && artifactType === "ontology"
    ? validateOntologyContract(artifact)
    : { valid: true, errors: [] };
  return {
    valid: valid && semanticResult.valid,
    errors: [
      ...(valid ? [] : validator.errors.map((error) => ({
        path: error.instancePath || "/",
        message: error.message,
        schemaPath: error.schemaPath
      }))),
      ...semanticResult.errors.map((error) => ({
        path: error.path,
        message: error.message,
        code: error.code
      }))
    ],
    rawErrors: valid ? [] : validator.errors,
    semanticErrors: semanticResult.errors
  };
}

export async function parseYamlArtifact(filePath) {
  return YAML.parse(await readFile(filePath, "utf8"));
}
