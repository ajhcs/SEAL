#!/usr/bin/env node
import { formatValidationReport, validateSealArtifacts } from "../validation/validate.mjs";
import { bootstrapOntologyIfMissing } from "../ontology/bootstrap.mjs";

const args = process.argv.slice(2);
const bootstrap = args.includes("--bootstrap-ontology");
const target = args.find((arg) => arg !== "--bootstrap-ontology") ?? process.cwd();
if (bootstrap) {
  const result = await bootstrapOntologyIfMissing(target);
  if (result.created) {
    console.log(`bootstrapped ontology: ${result.outputPath}`);
  } else {
    console.log(`ontology already exists: ${result.outputPath}`);
  }
}
const result = await validateSealArtifacts(target);

console.log(formatValidationReport(result));
process.exitCode = result.valid ? 0 : 1;
