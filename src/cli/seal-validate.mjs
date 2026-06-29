#!/usr/bin/env node
import { formatValidationReport, validateSealArtifacts } from "../validation/validate.mjs";

const target = process.argv[2] ?? process.cwd();
const result = await validateSealArtifacts(target);

console.log(formatValidationReport(result));
process.exitCode = result.valid ? 0 : 1;
