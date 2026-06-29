export const CLAIM_TYPES = Object.freeze([
  "functional",
  "safety",
  "reliability",
  "security",
  "performance",
  "usability",
  "launch",
  "operational"
]);

export const EVIDENCE_TYPES = Object.freeze([
  "command_output",
  "static_inspection",
  "external_reference",
  "human_approval",
  "gap_record",
  "test_result"
]);

export const CLAIM_EVIDENCE_TYPES = Object.freeze({
  functional: ["test_result", "command_output", "static_inspection"],
  safety: ["test_result", "static_inspection", "human_approval"],
  reliability: ["test_result", "command_output"],
  security: ["static_inspection", "test_result", "external_reference"],
  performance: ["test_result", "command_output"],
  usability: ["human_approval", "external_reference", "test_result"],
  launch: ["human_approval", "test_result", "command_output", "gap_record"],
  operational: ["command_output", "static_inspection", "external_reference", "test_result"]
});

export function validateProofTaxonomy(proof, evidenceIndex) {
  const evidenceById = new Map((evidenceIndex?.evidence ?? []).map((evidence) => [evidence.id, evidence]));
  const errors = [];

  for (const claim of proof?.claims ?? []) {
    const acceptedEvidenceTypes = CLAIM_EVIDENCE_TYPES[claim.type];
    if (!acceptedEvidenceTypes) {
      errors.push({
        code: "unknown_claim_type",
        id: claim.id,
        message: `Claim ${claim.id} uses unknown type ${claim.type}.`
      });
      continue;
    }

    for (const evidenceId of claim.evidence_refs ?? []) {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence) {
        continue;
      }

      if (!acceptedEvidenceTypes.includes(evidence.type)) {
        errors.push({
          code: "unsupported_evidence_type",
          claim_id: claim.id,
          evidence_id: evidence.id,
          message: `Claim ${claim.id} of type ${claim.type} cannot be proven by evidence ${evidence.id} of type ${evidence.type}.`
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
