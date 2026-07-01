import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

function asList(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function issueId(issue) {
  return issue?.id ?? issue?.key;
}

function issueClosed(issue) {
  return String(issue?.status ?? "").toLowerCase() === "closed";
}

function priorityNumber(issue) {
  if (typeof issue?.priority === "number") {
    return issue.priority;
  }
  const match = String(issue?.priority ?? "").match(/\d+/);
  return match ? Number(match[0]) : 99;
}

function hasAcceptanceCriteria(issue) {
  return asList(issue?.acceptance_criteria).length > 0
    || asList(issue?.acceptance).length > 0
    || /acceptance/i.test(String(issue?.description ?? ""));
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function structuredAcceptanceCriteria(issue) {
  const criteria = [
    ...asList(issue?.acceptance_criteria),
    ...asList(issue?.acceptance)
  ]
    .map(normalizeText)
    .filter(Boolean);
  return [...new Set(criteria)];
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readIssues(issuesPath) {
  try {
    const raw = await readFile(issuesPath, "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function closureEvidencePath(root, beadId) {
  return path.join(root, ".seal", "closure", `${beadId}.yaml`);
}

async function readEvidence(filePath) {
  return YAML.parse(await readFile(filePath, "utf8"));
}

function withinRoot(root, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    return false;
  }
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(root, relativePath);
  return resolved === normalizedRoot || resolved.startsWith(`${normalizedRoot}${path.sep}`);
}

function pushError(errors, code, beadId, file, entryPath, message, expected = "valid closure evidence", actual = code) {
  errors.push({
    code,
    bead_id: beadId,
    file,
    path: entryPath,
    expected,
    actual,
    message,
  });
}

async function validatePathList({ root, beadId, field, values, evidenceFile, code, errors }) {
  const records = asList(values);
  if (records.length === 0) {
    pushError(
      errors,
      `missing_${field}`,
      beadId,
      evidenceFile,
      `/${field}`,
      `${field} must list at least one repository path.`,
      "one or more existing repository-relative paths",
      "empty"
    );
    return;
  }

  for (const value of records) {
    if (!withinRoot(root, value)) {
      pushError(
        errors,
        `invalid_${field}_path`,
        beadId,
        evidenceFile,
        `/${field}`,
        `${field} path must stay inside the repository: ${value}`,
        "repository-relative path",
        value
      );
      continue;
    }
    if (!await fileExists(path.join(root, value))) {
      pushError(
        errors,
        code,
        beadId,
        evidenceFile,
        `/${field}`,
        `${field} references a missing path: ${value}`,
        "existing repository path",
        value
      );
    }
  }
}

async function validateCriteriaCoverage({ root, issue, beadId, evidence, evidenceFile, errors }) {
  const expectedCriteria = structuredAcceptanceCriteria(issue);
  if (expectedCriteria.length === 0) {
    return;
  }

  const coverageRecords = asList(evidence?.criteria_coverage);
  if (coverageRecords.length === 0) {
    pushError(
      errors,
      "missing_criteria_coverage",
      beadId,
      evidenceFile,
      "/criteria_coverage",
      "Closure evidence must map every bead acceptance criterion to validation commands and evidence paths.",
      "one coverage entry per bead acceptance criterion",
      "empty"
    );
    return;
  }

  const expectedSet = new Set(expectedCriteria);
  const coveredCriteria = new Set();
  const validationCommands = new Set(asList(evidence?.validation_commands).map(normalizeText).filter(Boolean));

  for (const [index, record] of coverageRecords.entries()) {
    const entryPath = `/criteria_coverage/${index}`;
    const criterion = normalizeText(record?.acceptance_criterion);
    if (!expectedSet.has(criterion)) {
      pushError(
        errors,
        "criterion_coverage_mismatch",
        beadId,
        evidenceFile,
        `${entryPath}/acceptance_criterion`,
        `criteria_coverage entry must match a bead acceptance criterion exactly: ${criterion}`,
        expectedCriteria.join(" | "),
        criterion || "empty"
      );
    } else {
      coveredCriteria.add(criterion);
    }

    const commands = asList(record?.validation_commands).map(normalizeText).filter(Boolean);
    if (commands.length === 0) {
      pushError(
        errors,
        "missing_criterion_validation_command",
        beadId,
        evidenceFile,
        `${entryPath}/validation_commands`,
        "Each acceptance criterion coverage entry must list at least one validation command.",
        "one or more commands also listed in /validation_commands",
        "empty"
      );
    }
    for (const command of commands) {
      if (!validationCommands.has(command)) {
        pushError(
          errors,
          "unknown_criterion_validation_command",
          beadId,
          evidenceFile,
          `${entryPath}/validation_commands`,
          `Criterion coverage references a validation command not listed in validation_commands: ${command}`,
          "command listed in /validation_commands",
          command
        );
      }
    }

    const evidencePaths = asList(record?.evidence_paths).map((value) => String(value ?? "").trim()).filter(Boolean);
    if (evidencePaths.length === 0) {
      pushError(
        errors,
        "missing_criterion_evidence_path",
        beadId,
        evidenceFile,
        `${entryPath}/evidence_paths`,
        "Each acceptance criterion coverage entry must list at least one evidence path.",
        "one or more existing repository-relative paths",
        "empty"
      );
    }
    for (const evidencePath of evidencePaths) {
      if (!withinRoot(root, evidencePath)) {
        pushError(
          errors,
          "invalid_criterion_evidence_path",
          beadId,
          evidenceFile,
          `${entryPath}/evidence_paths`,
          `Criterion evidence path must stay inside the repository: ${evidencePath}`,
          "repository-relative path",
          evidencePath
        );
        continue;
      }
      if (!await fileExists(path.join(root, evidencePath))) {
        pushError(
          errors,
          "missing_criterion_evidence_path",
          beadId,
          evidenceFile,
          `${entryPath}/evidence_paths`,
          `Criterion evidence path does not exist: ${evidencePath}`,
          "existing repository path",
          evidencePath
        );
      }
    }
  }

  for (const criterion of expectedCriteria) {
    if (!coveredCriteria.has(criterion)) {
      pushError(
        errors,
        "uncovered_acceptance_criterion",
        beadId,
        evidenceFile,
        "/criteria_coverage",
        `Acceptance criterion is not covered by criteria_coverage: ${criterion}`,
        "criterion covered by validation commands and evidence paths",
        "uncovered"
      );
    }
  }
}

function closureTargets({ issues, beadIds, requireEvidenceForAllClosed }) {
  if (beadIds?.length) {
    return beadIds.map((id) => {
      const issue = issues.find((record) => issueId(record) === id);
      return issue ?? { id, status: "closed", priority: 0, acceptance_criteria: ["explicitly requested closure evidence"] };
    });
  }

  if (!requireEvidenceForAllClosed) {
    return [];
  }

  return issues.filter((issue) => issueClosed(issue) && priorityNumber(issue) <= 1 && hasAcceptanceCriteria(issue));
}

export async function validateBeadClosureEvidence({
  rootPath = process.cwd(),
  issuesPath,
  beadIds,
  requireEvidenceForAllClosed = true,
} = {}) {
  const root = path.resolve(rootPath);
  const issueFile = issuesPath ?? path.join(root, ".beads", "issues.jsonl");
  const issues = await readIssues(issueFile);
  const targets = closureTargets({ issues, beadIds, requireEvidenceForAllClosed });
  const errors = [];

  for (const issue of targets) {
    const beadId = issueId(issue);
    if (!beadId) {
      continue;
    }

    const evidenceFile = closureEvidencePath(root, beadId);
    let evidence;
    try {
      evidence = await readEvidence(evidenceFile);
    } catch (error) {
      if (error.code === "ENOENT") {
        pushError(
          errors,
          "missing_evidence",
          beadId,
          evidenceFile,
          "/",
          `Closed P0/P1 bead ${beadId} needs machine-readable closure evidence.`,
          `.seal/closure/${beadId}.yaml`,
          "missing"
        );
        continue;
      }
      pushError(errors, "invalid_evidence_yaml", beadId, evidenceFile, "/", error.message, "parseable YAML", "parse error");
      continue;
    }

    if (evidence?.bead_id !== beadId) {
      pushError(errors, "bead_id_mismatch", beadId, evidenceFile, "/bead_id", "Closure evidence bead_id must match the closed bead.", beadId, evidence?.bead_id);
    }
    if (asList(evidence?.acceptance_criteria).length === 0) {
      pushError(errors, "missing_acceptance_criteria", beadId, evidenceFile, "/acceptance_criteria", "Closure evidence must restate the proven acceptance criteria.", "non-empty list", "empty");
    }
    if (!evidence?.implementation_summary || typeof evidence.implementation_summary !== "string") {
      pushError(errors, "missing_implementation_summary", beadId, evidenceFile, "/implementation_summary", "Closure evidence must summarize the implementation.", "non-empty string", typeof evidence?.implementation_summary);
    }
    if (asList(evidence?.validation_commands).length === 0) {
      pushError(errors, "missing_validation_commands", beadId, evidenceFile, "/validation_commands", "Closure evidence must list validation commands.", "non-empty list", "empty");
    }
    if (evidence?.proof_result !== "passed") {
      pushError(errors, "proof_not_passed", beadId, evidenceFile, "/proof_result", "Closure evidence proof_result must be passed.", "passed", evidence?.proof_result);
    }

    await validatePathList({
      root,
      beadId,
      field: "changed_source_paths",
      values: evidence?.changed_source_paths,
      evidenceFile,
      code: "missing_changed_source_path",
      errors,
    });
    await validatePathList({
      root,
      beadId,
      field: "changed_test_paths",
      values: evidence?.changed_test_paths,
      evidenceFile,
      code: "missing_changed_test_path",
      errors,
    });
    await validateCriteriaCoverage({
      root,
      issue,
      beadId,
      evidence,
      evidenceFile,
      errors,
    });
  }

  return {
    valid: errors.length === 0,
    checked: targets.map(issueId).filter(Boolean),
    errors,
  };
}
