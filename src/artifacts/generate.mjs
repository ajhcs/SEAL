import YAML from "yaml";
import { validateArtifact } from "./schema-registry.mjs";
import { validateAuthority } from "./authority.mjs";
import { validateArtifactReferences } from "./reference-integrity.mjs";
import { validateProofTaxonomy } from "../proof/taxonomy.mjs";

export function createMinimalArtifactSet({ sourceId = "src.generated", componentId = "cmp.generated" } = {}) {
  const map = {
    schema_version: "0.1.0",
    sources: [
      {
        id: sourceId,
        kind: "repo_observation",
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 1,
        label: "Generated repository observation",
        plain_language: "SEAL observed this starter artifact set while initializing the workspace."
      }
    ],
    components: [
      {
        id: componentId,
        name: "Generated component",
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "pending",
        confidence: 0.8,
        purpose: "Starter component for the first SEAL map.",
        next_step: "Replace this with the real component name after repository or plan ingestion."
      }
    ],
    files: [
      {
        path: "README.md",
        classification: "documentation",
        component_id: componentId,
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "pending",
        confidence: 0.8,
        purpose: "Starter file coverage proving the map is not empty.",
        next_step: "Classify every non-ignored file or record an explicit gap."
      }
    ],
    gaps: [
      {
        id: "gap.generated-proof",
        summary: "Generated scaffold has no mapped proof evidence yet.",
        reason: "The initial map records missing proof coverage explicitly.",
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.8,
        status: "open",
        plain_language: "SEAL has not seen proof evidence yet.",
        next_step: "Run validation or attach command output as evidence."
      }
    ]
  };

  const impact = {
    schema_version: "0.1.0",
    id: "IMPACT-generated",
    change: {
      summary: "Generated scaffold impact placeholder.",
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.6,
      plain_language: "No real change has been supplied yet, so this impact record is a safe starter.",
      example_change: "Change request, bug fix, dependency upgrade, or launch decision to analyze."
    },
    affected: [
      {
        kind: "component",
        id: componentId,
        reason: "The placeholder impact is scoped to the generated component.",
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "pending",
        confidence: 0.6,
        plain_language: "This starter impact is attached to the starter component until a real change is analyzed.",
        next_step: "Replace or expand affected records after impact analysis."
      }
    ],
    proof_needed: [
      {
        claim_id: "claim.generated-readable",
        reason: "Readable generated artifacts require validation evidence.",
        plain_language: "SEAL needs evidence before treating this starter set as launch-ready.",
        next_step: "Run seal-validate and attach the result as evidence."
      }
    ],
    gaps: [
      {
        id: "gap.generated-impact-evidence",
        summary: "Impact analysis has not been run on a real change.",
        reason: "This artifact is generated before a user supplies a change.",
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.8,
        plain_language: "A real change has not been described yet.",
        next_step: "Add a concrete change before relying on impact conclusions."
      }
    ]
  };

  const proof = {
    schema_version: "0.1.0",
    claims: [
      {
        id: "claim.generated-readable",
        type: "launch",
        statement: "Generated artifacts are present and structurally valid.",
        source_refs: [sourceId],
        evidence_refs: [],
        gap_refs: ["gap.generated-proof-evidence"],
        authority_state: "repo_observed",
        approval_state: "pending",
        confidence: 0.6,
        plain_language: "The files exist and validate structurally, but proof still needs evidence.",
        next_step: "Attach validation output or keep the proof gap open."
      }
    ],
    gaps: [
      {
        id: "gap.generated-proof-evidence",
        summary: "No command evidence has been attached.",
        reason: "Proof requires recorded evidence or an explicit gap.",
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.8,
        status: "open",
        plain_language: "There is no recorded command, test, or review evidence yet.",
        next_step: "Run a validation command and record the output in the evidence index."
      }
    ]
  };

  const evidenceIndex = {
    schema_version: "0.1.0",
    evidence: [
      {
        id: "ev.generated-gap",
        type: "gap_record",
        claim_ids: ["claim.generated-readable"],
        status: "incomplete",
        captured_at: "1970-01-01T00:00:00.000Z",
        source: {
          kind: "gap_record",
          summary: "Generated proof gap records missing evidence."
        },
        artifact_path: ".seal/proof.yaml",
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.8,
        redaction: "not_applicable",
        limitations: "Generated starter evidence records a known gap only.",
        plain_language: "This evidence item is intentionally incomplete.",
        how_to_complete: "Attach command output, test results, static inspection notes, or human approval."
      }
    ]
  };

  return { map, impact, proof, evidenceIndex };
}

export async function assertGeneratedArtifactsValid(artifactSet) {
  for (const [artifactType, artifact] of Object.entries(artifactSet)) {
    const result = await validateArtifact(artifactType, artifact);
    if (!result.valid) {
      throw new Error(`Generated ${artifactType} artifact failed schema validation: ${JSON.stringify(result.errors)}`);
    }
  }

  const referenceResult = validateArtifactReferences(artifactSet);
  if (!referenceResult.valid) {
    throw new Error(`Generated artifact references failed validation: ${JSON.stringify(referenceResult.errors)}`);
  }

  const authorityResult = validateAuthority(artifactSet);
  if (!authorityResult.valid) {
    throw new Error(`Generated artifact authority failed validation: ${JSON.stringify(authorityResult.errors)}`);
  }

  const taxonomyResult = validateProofTaxonomy(artifactSet.proof, artifactSet.evidenceIndex);
  if (!taxonomyResult.valid) {
    throw new Error(`Generated proof taxonomy failed validation: ${JSON.stringify(taxonomyResult.errors)}`);
  }

  return artifactSet;
}

export function stringifyArtifact(artifact) {
  return YAML.stringify(artifact, { lineWidth: 0 });
}
