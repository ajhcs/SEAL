#!/usr/bin/env node
import path from "node:path";
import { validateBeadClosureEvidence } from "../beads/closure-evidence.mjs";

function printHelp() {
  console.log(`Usage: seal-closure-evidence [--root <path>] [--bead <id>] [--all-closed-p0-p1]

Validate machine-readable closure evidence for closed P0/P1 beads.

Options:
  --root <path>          Repository root. Defaults to the current directory.
  --bead <id>            Validate one bead id. Can be repeated.
  --all-closed-p0-p1     Validate every closed P0/P1 bead with acceptance criteria.
  -h, --help             Show this help.`);
}

function readRequiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    rootPath: process.cwd(),
    beadIds: [],
    requireEvidenceForAllClosed: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--root") {
      options.rootPath = path.resolve(readRequiredValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--bead") {
      options.beadIds.push(readRequiredValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--all-closed-p0-p1") {
      options.requireEvidenceForAllClosed = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.beadIds.length === 0 && !options.requireEvidenceForAllClosed) {
    options.requireEvidenceForAllClosed = true;
  }

  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const result = await validateBeadClosureEvidence(options);
  if (!result.valid) {
    for (const error of result.errors) {
      console.error(`${error.code}: ${error.message}`);
    }
    process.exit(1);
  }

  console.log(`Closure evidence valid for ${result.checked.length} bead(s).`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
