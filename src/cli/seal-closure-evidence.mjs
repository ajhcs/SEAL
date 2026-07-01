#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { validateBeadClosureEvidence } from "../beads/closure-evidence.mjs";

function printHelp() {
  console.log(`Usage: seal-closure-evidence [--root <path>] [--bead <id>] [--all-closed-p0-p1] [--reopen-failed]

Validate machine-readable closure evidence for closed P0/P1 beads.

Options:
  --root <path>          Repository root. Defaults to the current directory.
  --bead <id>            Validate one bead id. Can be repeated.
  --all-closed-p0-p1     Validate every closed P0/P1 bead with acceptance criteria.
  --reopen-failed        Reopen failed beads with bd reopen after validation fails.
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
    requireEvidenceForAllClosed: false,
    reopenFailed: false
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
    if (arg === "--reopen-failed") {
      options.reopenFailed = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.beadIds.length === 0 && !options.requireEvidenceForAllClosed) {
    options.requireEvidenceForAllClosed = true;
  }

  return options;
}

function failureCodesByBead(errors) {
  const byBead = new Map();
  for (const error of errors) {
    if (!error.bead_id) {
      continue;
    }
    const codes = byBead.get(error.bead_id) ?? new Set();
    codes.add(error.code);
    byBead.set(error.bead_id, codes);
  }
  return byBead;
}

function reopenFailedBeads(rootPath, errors) {
  const reopened = [];
  const bdExecutable = process.env.SEAL_BD_BIN || "bd";
  for (const [beadId, codes] of failureCodesByBead(errors)) {
    const sortedCodes = [...codes].sort();
    const reason = `Closure evidence failed: ${sortedCodes.join(", ")}`;
    const spawnOptions = {
      cwd: rootPath,
      encoding: "utf8"
    };
    if (process.platform === "win32" && /\.(?:bat|cmd)$/i.test(bdExecutable)) {
      spawnOptions.shell = true;
    }
    const result = spawnSync(bdExecutable, ["reopen", beadId, "--reason", reason], {
      ...spawnOptions
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`bd reopen failed for ${beadId}: ${result.stderr || result.stdout || `exit ${result.status}`}`);
    }
    reopened.push({ beadId, codes: sortedCodes });
  }
  return reopened;
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
    if (options.reopenFailed) {
      for (const reopened of reopenFailedBeads(options.rootPath, result.errors)) {
        console.error(`reopened: ${reopened.beadId} (${reopened.codes.join(", ")})`);
      }
    }
    process.exit(1);
  }

  console.log(`Closure evidence valid for ${result.checked.length} bead(s).`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
