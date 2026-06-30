import {
  CLAIM_STATUSES,
  CLAIM_TYPES,
  EVIDENCE_TYPES
} from "../contracts/constants.mjs";

export { CLAIM_TYPES, EVIDENCE_TYPES };

export const CLAIM_EVIDENCE_TYPES = Object.freeze({
  functional: [
    "unit_test",
    "integration_test",
    "e2e_test",
    "contract_test",
    "property_based_test",
    "test_result",
    "command_output",
    "static_inspection",
    "repo_observation"
  ],
  safety: [
    "unit_test",
    "integration_test",
    "fault_injection",
    "property_based_test",
    "model_check",
    "static_analysis",
    "human_approval",
    "test_result",
    "static_inspection"
  ],
  reliability: [
    "integration_test",
    "e2e_test",
    "load_test",
    "fault_injection",
    "telemetry",
    "canary_result",
    "test_result",
    "command_output"
  ],
  security: [
    "security_scan",
    "static_analysis",
    "accessibility_check",
    "repo_observation",
    "external_source_snapshot",
    "static_inspection",
    "test_result",
    "external_reference"
  ],
  performance: [
    "performance_measurement",
    "load_test",
    "cost_calculation",
    "mathematical_analysis",
    "telemetry",
    "test_result",
    "command_output"
  ],
  usability: [
    "accessibility_check",
    "visual_review",
    "screenshot",
    "browser_recording",
    "human_approval",
    "external_reference",
    "test_result"
  ],
  launch: [
    "canary_result",
    "telemetry",
    "human_approval",
    "unit_test",
    "integration_test",
    "e2e_test",
    "contract_test",
    "schema_validation",
    "migration_dry_run",
    "typecheck",
    "lint",
    "security_scan",
    "performance_measurement",
    "load_test",
    "test_result",
    "command_output"
  ],
  operational: [
    "telemetry",
    "canary_result",
    "fault_injection",
    "load_test",
    "command_output",
    "static_inspection",
    "external_reference",
    "test_result"
  ],
  data: [
    "schema_validation",
    "migration_dry_run",
    "contract_test",
    "static_analysis",
    "repo_observation",
    "test_result"
  ],
  cost: [
    "cost_calculation",
    "mathematical_analysis",
    "performance_measurement",
    "external_source_snapshot",
    "telemetry"
  ],
  accessibility: [
    "accessibility_check",
    "visual_review",
    "screenshot",
    "browser_recording",
    "human_approval"
  ],
  architecture: [
    "repo_observation",
    "static_inspection",
    "contract_test",
    "schema_validation",
    "external_source_snapshot",
    "human_approval"
  ]
});

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function evidenceRecords(proof, evidenceIndex) {
  return [
    ...asList(proof?.evidence),
    ...asList(evidenceIndex?.evidence)
  ];
}

function buildEvidenceIndex(proof, evidenceIndex) {
  const byId = new Map();
  for (const evidence of evidenceRecords(proof, evidenceIndex)) {
    if (evidence?.id && !byId.has(evidence.id)) {
      byId.set(evidence.id, evidence);
    }
  }
  return byId;
}

function freshnessIsCurrent(claim) {
  const freshness = claim?.freshness;
  return !freshness || freshness.status === "current";
}

export function validateProofTaxonomy(proof, evidenceIndex) {
  const evidenceById = buildEvidenceIndex(proof, evidenceIndex);
  const errors = [];
  const claimTypes = new Set(CLAIM_TYPES);
  const evidenceTypes = new Set(EVIDENCE_TYPES);
  const claimStatuses = new Set(CLAIM_STATUSES);

  for (const evidence of evidenceById.values()) {
    if (!evidenceTypes.has(evidence.type)) {
      errors.push({
        code: "unsupported_evidence_type",
        evidence_id: evidence.id,
        message: `Evidence ${evidence.id} uses unsupported type ${evidence.type}.`
      });
    }
  }

  for (const claim of proof?.claims ?? []) {
    const acceptedEvidenceTypes = CLAIM_EVIDENCE_TYPES[claim.type];
    if (!claimTypes.has(claim.type) || !acceptedEvidenceTypes) {
      errors.push({
        code: "unknown_claim_type",
        id: claim.id,
        message: `Claim ${claim.id} uses unknown type ${claim.type}.`
      });
      continue;
    }

    if (claim.status && !claimStatuses.has(claim.status)) {
      errors.push({
        code: "invalid_claim_status",
        id: claim.id,
        message: `Claim ${claim.id} uses invalid status ${claim.status}.`
      });
    }

    for (const evidenceId of claim.evidence_refs ?? []) {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence) {
        continue;
      }

      if (claim.status === "proven" && !acceptedEvidenceTypes.includes(evidence.type)) {
        errors.push({
          code: "unsupported_evidence_type",
          claim_id: claim.id,
          evidence_id: evidence.id,
          message: `Claim ${claim.id} of type ${claim.type} cannot be proven by evidence ${evidence.id} of type ${evidence.type}.`
        });
      }
    }

    if (claim.status === "proven") {
      const supportingEvidence = asList(claim.evidence_refs)
        .map((evidenceId) => evidenceById.get(evidenceId))
        .filter(Boolean);
      const nonGapEvidence = supportingEvidence.filter((evidence) => evidence.type !== "gap_record");

      if (nonGapEvidence.length === 0) {
        errors.push({
          code: "false_proof_missing_evidence",
          id: claim.id,
          message: `Claim ${claim.id} is marked proven without non-gap evidence.`
        });
      }

      if (asList(claim.gap_refs).length > 0) {
        errors.push({
          code: "false_proof_open_gaps",
          id: claim.id,
          message: `Claim ${claim.id} is marked proven while gap_refs remain attached.`
        });
      }

      if (!freshnessIsCurrent(claim)) {
        errors.push({
          code: "stale_evidence_marked_current",
          id: claim.id,
          message: `Claim ${claim.id} is marked proven with non-current freshness.`
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
