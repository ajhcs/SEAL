import YAML from "yaml";
import { validateArtifact } from "./schema-registry.mjs";
import { validateAuthority } from "./authority.mjs";
import { validateArtifactReferences } from "./reference-integrity.mjs";
import { validateProofTaxonomy } from "../proof/taxonomy.mjs";
import {
  CONTEXT_PACK_BUDGET,
  CONTRACT_SCHEMA_VERSION,
  GENERATED_VIEW_NOTICE,
  ONTOLOGY_ACTION_TYPES,
  ONTOLOGY_ENTITY_TYPES,
  ONTOLOGY_STATE_TYPES,
  PLAN_STATUSES,
  TRACE_RELATION_TYPES
} from "../contracts/constants.mjs";

const GENERATED_AT = "1970-01-01T00:00:00.000Z";
const EMPTY_SHA256 = "0000000000000000000000000000000000000000000000000000000000000000";

function sourceFields(sourceId, confidence = 0.8) {
  return {
    source_refs: [sourceId],
    authority_state: "repo_observed",
    approval_state: "pending",
    confidence
  };
}

function sourcedText(summary, sourceId, confidence = 0.8, overrides = {}) {
  return {
    summary,
    ...sourceFields(sourceId, confidence),
    ...overrides
  };
}

function sourcedRecord(id, summary, sourceId, confidence = 0.8, overrides = {}) {
  return {
    id,
    summary,
    ...sourceFields(sourceId, confidence),
    ...overrides
  };
}

function titleFromId(id) {
  return id
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function createSourceRecord({
  sourceId = "src.generated",
  kind = "repo_observation",
  authorityState = "repo_observed",
  approvalState = "not_required",
  confidence = 1,
  description = "SEAL generated this record from local workspace inspection.",
  plainLanguage = "This source explains where SEAL got the starter contract facts and how much authority they carry."
} = {}) {
  return {
    id: sourceId,
    kind,
    description,
    plain_language: plainLanguage,
    authority_state: authorityState,
    approval_state: approvalState,
    confidence
  };
}

export function createSourcesArtifact({ source = createSourceRecord(), sources } = {}) {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    sources: sources ?? [source]
  };
}

export function createOntologyArtifact({ sourceId = "src.generated" } = {}) {
  const fields = {
    source_refs: [sourceId],
    authority_state: "repo_observed",
    approval_state: "not_required",
    confidence: 1
  };

  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    id: "ontology.seal.v1",
    name: "SEAL ontology contract v1",
    purpose: {
      summary: "Define the canonical object, relationship, action, and state vocabulary used by SEAL artifacts.",
      plain_language: "This file lists the SEAL record types and actions other artifacts are allowed to use.",
      next_step: "Use these types when editing MAP, IMPACT, PROVE, FLY, or generated views by hand.",
      ...fields
    },
    entity_types: ONTOLOGY_ENTITY_TYPES.map((id) => ({
      id,
      name: titleFromId(id),
      description: `SEAL ontology entity type: ${titleFromId(id)}.`,
      ...fields
    })),
    relationship_types: TRACE_RELATION_TYPES.map((id) => ({
      id,
      name: titleFromId(id),
      from: ["*"],
      to: ["*"],
      description: `SEAL trace relationship: ${titleFromId(id)}.`,
      ...fields
    })),
    action_types: ONTOLOGY_ACTION_TYPES.map((id) => ({
      id,
      name: titleFromId(id),
      description: `SEAL ontology action type: ${titleFromId(id)}.`,
      ...fields
    })),
    state_types: ONTOLOGY_STATE_TYPES.map((id) => ({
      id,
      name: titleFromId(id),
      description: `SEAL ontology state type: ${titleFromId(id)}.`,
      ...fields
    })),
    command_bindings: [
      {
        command: "map",
        consumes: ["source", "ontology"],
        emits: ["component", "file", "dependency", "service", "interface", "data_store", "test", "gap"],
        relationships: ["implements", "depends_on", "exposes", "consumes", "produces", "owned_by", "observed_in"],
        actions: ["canonical_reload", "repo_observe", "map_emit"],
        ...fields
      },
      {
        command: "impact",
        consumes: ["ontology", "map", "trace_relation"],
        emits: ["impact", "gap"],
        relationships: ["depends_on", "blocks", "mitigates", "configured_by"],
        actions: ["canonical_reload", "impact_traverse"],
        ...fields
      },
      {
        command: "prove",
        consumes: ["ontology", "claim", "evidence", "gap"],
        emits: ["claim", "evidence", "gap"],
        relationships: ["verifies", "proven_by", "gapped_by"],
        actions: ["canonical_reload", "prove_bind"],
        ...fields
      },
      {
        command: "fly",
        consumes: ["ontology", "plan", "proof", "debt"],
        emits: ["fly_cycle", "state_transition", "evidence"],
        relationships: ["observed_in", "blocks", "supersedes"],
        actions: ["canonical_reload", "fly_record_transition"],
        ...fields
      },
      {
        command: "validate",
        consumes: ["ontology", "map", "impact", "proof"],
        emits: ["validation_result"],
        relationships: ["configured_by"],
        actions: ["canonical_reload", "validate_artifacts"],
        ...fields
      },
      {
        command: "dashboard",
        consumes: ["ontology", "map", "impact", "proof", "fly_cycle"],
        emits: ["generated_view"],
        relationships: ["observed_in"],
        actions: ["canonical_reload", "render_generated_view"],
        ...fields
      }
    ],
    canonical_reload: {
      action_type: "canonical_reload",
      required_before: ["validate", "dashboard", "proof_report", "gap_review", "launch_readiness"],
      preserves_human_fields: true,
      description: "Canonical .seal YAML is reloaded before validation, reports, and generated views so human-edited canonical fields remain authoritative.",
      ...fields
    },
    ...fields
  };
}

export function createPlanArtifact({
  sourceId = "src.generated",
  planId = "PLAN-generated",
  componentId = "cmp.generated",
  objectiveSummary,
  userSummary,
  painSummary,
  status,
  scope,
  nonGoals,
  tradePriorities,
  scenarios,
  acceptanceCriteria,
  architectureIntent,
  proofObligations,
  approvalNeeds,
  traceRefs
} = {}) {
  const plan = {
    schema_version: CONTRACT_SCHEMA_VERSION,
    id: planId,
    objective: {
      summary: "Understand the workspace, expose unknowns, and prove readiness before code changes.",
      ...sourceFields(sourceId, 0.7)
    },
    user: {
      summary: "Workspace maintainer or engineer using SEAL.",
      ...sourceFields(sourceId, 0.5),
      authority_state: "inferred"
    },
    pain: {
      summary: "Engineering work can proceed without a clear baseline, proof plan, or visible debt.",
      ...sourceFields(sourceId, 0.6),
      authority_state: "inferred"
    },
    scope: [
      {
        id: "SCOPE-generated-baseline",
        summary: "Create a baseline plan and proof obligations before substantial code changes.",
        ...sourceFields(sourceId, 0.7)
      }
    ],
    non_goals: [
      {
        id: "NONGOAL-generated-autodeploy",
        summary: "Do not deploy or mutate external production systems automatically.",
        ...sourceFields(sourceId, 0.8)
      }
    ],
    trade_priorities: [
      {
        id: "TRADE-generated-reliability",
        dimension: "reliability",
        rank: 1,
        rationale: "Reliable traceable change is required before speed can matter.",
        ...sourceFields(sourceId, 0.6),
        authority_state: "inferred"
      }
    ],
    scenarios: [
      {
        id: "SCENARIO-generated-map-first",
        name: "Map before code",
        summary: "SEAL inspects the repo, records what exists, and exposes unknowns before a code change.",
        path: "SEAL inspects the repo, records what exists, and exposes unknowns before a code change.",
        critical_events: ["unknown ownership", "missing proof", "stale evidence"],
        ...sourceFields(sourceId, 0.7)
      }
    ],
    acceptance_criteria: [
      {
        id: "AC-generated-contracts-valid",
        summary: "ONTOLOGY, MAP, PLAN, IMPACT, PROVE, TRACE, SOURCES, and DEBT artifacts validate against their schemas.",
        statement: "ONTOLOGY, MAP, PLAN, IMPACT, PROVE, TRACE, SOURCES, and DEBT artifacts validate against their schemas.",
        proof_method: "schema_validation",
        ...sourceFields(sourceId, 0.8)
      }
    ],
    architecture_intent: {
      components: [
        sourcedRecord("ARCH-generated-component", "A starter component exists until repository mapping replaces it with observed components.", sourceId, 0.6, {
          component_id: componentId
        })
      ],
      interfaces: [],
      data_stores: [],
      boundaries: [
        sourcedRecord("BOUNDARY-generated-root", "The initial architecture boundary is the workspace root.", sourceId, 0.6)
      ],
      ...sourceFields(sourceId, 0.6)
    },
    proof_obligations: [
      {
        id: "PO-generated-structural-validity",
        subject: "generated artifacts",
        claim: "Generated artifacts are present and structurally valid.",
        method: "schema_validation",
        status: "planned",
        ...sourceFields(sourceId, 0.8)
      }
    ],
    approval_needs: [
      {
        id: "APPROVAL-generated-plan-baseline",
        subject: planId,
        summary: "A human owner must approve this plan before it becomes the baseline.",
        needed_for: "approved baseline status",
        approver: "human owner",
        status: "pending",
        ...sourceFields(sourceId, 0.7)
      }
    ],
    source_refs: [sourceId],
    trace_refs: ["trace.generated-plan-to-component", "trace.generated-proof-obligation"],
    status: PLAN_STATUSES[0],
    change_policy: {
      code_change_requires_plan_alignment: true,
      impact_required_for_behavior_change: true,
      proof_required_before_confidence: true,
      approved_plan_conflicts: "warn_or_block_until_plan_impact_proof_update"
    },
    baseline: {
      plan_id: planId,
      status: PLAN_STATUSES[0],
      approved_by: "",
      approved_at: "",
      applies_to: ["."],
      supersedes: [],
      change_policy: {
        code_change_requires_plan_alignment: true,
        impact_required_for_behavior_change: true,
        proof_required_before_confidence: true
      }
    }
  };

  if (objectiveSummary) plan.objective.summary = objectiveSummary;
  if (userSummary) plan.user.summary = userSummary;
  if (painSummary) plan.pain.summary = painSummary;
  if (status) {
    plan.status = status;
    plan.baseline.status = status;
  }
  if (scope) plan.scope = scope;
  if (nonGoals) plan.non_goals = nonGoals;
  if (tradePriorities) plan.trade_priorities = tradePriorities;
  if (scenarios) plan.scenarios = scenarios;
  if (acceptanceCriteria) plan.acceptance_criteria = acceptanceCriteria;
  if (architectureIntent) plan.architecture_intent = architectureIntent;
  if (proofObligations) plan.proof_obligations = proofObligations;
  if (approvalNeeds) plan.approval_needs = approvalNeeds;
  if (traceRefs) plan.trace_refs = traceRefs;

  return plan;
}

export function createMapArtifact({
  sourceId = "src.generated",
  componentId = "cmp.generated"
} = {}) {
  const source = createSourceRecord({ sourceId });
  const filePath = "README.md";
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    purpose: {
      summary: "MAP records what exists in the workspace and what remains unknown.",
      ...sourceFields(sourceId, 0.8)
    },
    boundary: {
      root: ".",
      included: ["README.md"],
      excluded: ["node_modules", ".git"],
      ...sourceFields(sourceId, 0.8)
    },
    observed: {
      components: [componentId],
      files: [filePath],
      dependencies: [],
      services: [],
      interfaces: [],
      data_stores: [],
      tests: [],
      source_refs: [sourceId]
    },
    approved: {
      components: [],
      boundaries: [],
      interfaces: [],
      source_refs: [sourceId],
      status: "none",
      authority_state: "unknown",
      approval_state: "pending",
      confidence: 0.2
    },
    drift: [
      {
        id: "drift.generated-unapproved-component",
        observed_component: componentId,
        approved_component: null,
        issue: "Component exists in observed reality but has no approved architecture baseline yet.",
        severity: "warning",
        ...sourceFields(sourceId, 0.7)
      }
    ],
    components: [
      {
        id: componentId,
        name: "Generated component",
        purpose: "Starter component for the first SEAL map.",
        files: [filePath],
        dependencies: [],
        interfaces: [],
        tests: [],
        proof_gaps: ["gap.generated-proof"],
        unknowns: ["gap.generated-proof"],
        ...sourceFields(sourceId, 0.8)
      }
    ],
    files: [
      {
        path: filePath,
        classification: "documentation",
        component_id: componentId,
        owner_component_id: componentId,
        ownership_status: "owned",
        content_hash: EMPTY_SHA256,
        mapped_at: GENERATED_AT,
        purpose: "Starter file coverage proving the map is not empty.",
        next_step: "Classify every non-ignored file or record an explicit gap.",
        ...sourceFields(sourceId, 0.8)
      }
    ],
    dependencies: [],
    services: {
      discovered: [],
      negative_evidence: [
        "checked package manifests",
        "checked environment variable names",
        "checked Docker and compose files",
        "checked CI configs",
        "checked known SDK imports"
      ],
      gaps: ["gap.generated-service-cost-discovery"]
    },
    interfaces: [],
    data_stores: [],
    tests: [],
    unknowns: [
      {
        id: "gap.generated-proof",
        name: "Generated proof gap",
        summary: "Generated scaffold has no mapped proof evidence yet.",
        reason: "The initial map records missing proof coverage explicitly.",
        status: "open",
        plain_language: "SEAL has not seen proof evidence yet.",
        next_step: "Run validation or attach command output as evidence.",
        ...sourceFields(sourceId, 0.8),
        approval_state: "not_required"
      },
      {
        id: "gap.generated-service-cost-discovery",
        name: "Generated service and cost discovery gap",
        summary: "Starter map records negative evidence but no full service/cost scan has been run.",
        status: "open",
        ...sourceFields(sourceId, 0.7),
        approval_state: "not_required"
      }
    ],
    sources: [source]
  };
}

export function createImpactArtifact({
  sourceId = "src.generated",
  componentId = "cmp.generated",
  filePath = "README.md",
  impactId = "IMPACT-generated",
  serviceGapId = "gap.generated-service-cost-discovery"
} = {}) {
  const impactGap = {
    id: "gap.generated-impact-evidence",
    summary: "Impact analysis has not been run on a real change.",
    missing: "Concrete change scope",
    closure_method: "Run /seal impact with a target change.",
    blocks: [impactId],
    severity: "warning",
    status: "open",
    ...sourceFields(sourceId, 0.8),
    approval_state: "not_required"
  };

  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    id: impactId,
    change: {
      target: "generated scaffold",
      summary: "Generated scaffold impact placeholder.",
      plain_language: "No real change has been supplied yet, so this impact record is a safe starter.",
      example_change: "Change request, bug fix, dependency upgrade, or fly decision to analyze.",
      ...sourceFields(sourceId, 0.6)
    },
    affected: {
      requirements: [],
      components: [
        {
          id: "impact.generated-component",
          kind: "component",
          ref: componentId,
          summary: "The placeholder impact is scoped to the generated component.",
          ...sourceFields(sourceId, 0.6)
        }
      ],
      files: [
        {
          id: "impact.generated-file",
          kind: "file",
          ref: filePath,
          summary: "The placeholder impact records the starter mapped file.",
          ...sourceFields(sourceId, 0.6)
        }
      ],
      interfaces: [],
      invariants: [],
      schemas: [],
      tests: []
    },
    dependency_service_cost_impact: {
      dependencies_changed: false,
      services_changed: false,
      cost_changed: false,
      new_runtime_costs: [],
      removed_runtime_costs: [],
      unknown_costs: [
        {
          id: "impact.generated-unknown-cost",
          kind: "cost",
          ref: serviceGapId,
          summary: "Service and cost scan is not complete.",
          ...sourceFields(sourceId, 0.7)
        }
      ],
      source_refs: [sourceId]
    },
    proof_required: [
      {
        id: "proofreq.generated-readable",
        summary: "Readable generated artifacts require validation evidence.",
        plain_language: "Before relying on the generated starter files, run validation and attach the result as proof.",
        method: "schema_validation",
        claim_id: "claim.generated-readable",
        ...sourceFields(sourceId, 0.7)
      }
    ],
    approval_needed: [
      {
        id: "approval.generated-impact-scope",
        subject: impactId,
        summary: "A human owner must replace the scaffold with a real change scope before relying on it.",
        status: "pending",
        ...sourceFields(sourceId, 0.6)
      }
    ],
    blocking_unknowns: [impactGap],
    gaps: [impactGap],
    affected_flat: [
      {
        kind: "component",
        id: componentId,
        summary: "Compatibility view for older readers.",
        reason: "Compatibility view for older readers.",
        ...sourceFields(sourceId, 0.6)
      }
    ]
  };
}

export function createProofArtifact({ sourceId = "src.generated" } = {}) {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    claims: [
      {
        id: "claim.generated-readable",
        subject: "generated artifacts",
        type: "launch",
        statement: "Generated artifacts are present and structurally valid.",
        status: "gapped",
        source_refs: [sourceId],
        evidence_refs: ["ev.generated-gap"],
        gap_refs: ["gap.generated-proof-evidence"],
        counterevidence_refs: [],
        limitations: ["This is a scaffold claim until validation evidence is captured."],
        freshness: {
          status: "unknown",
          checked_at: GENERATED_AT,
          basis: "Generated starter artifact."
        },
        confidence: 0.6,
        authority_state: "repo_observed",
        approval_state: "pending",
        plain_language: "The files exist and validate structurally, but proof still needs evidence.",
        next_step: "Attach validation output or keep the proof gap open."
      }
    ],
    evidence: [
      {
        id: "ev.generated-gap",
        type: "gap_record",
        method: "gap_record",
        source: {
          kind: "gap_record",
          summary: "Generated proof gap records missing evidence."
        },
        result: "incomplete",
        supports: ["claim.generated-readable"],
        refutes: [],
        captured_at: GENERATED_AT,
        artifact_path: ".seal/proof.yaml",
        limitations: ["This evidence item records a known gap and does not prove readiness."],
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.8
      }
    ],
    gaps: [
      {
        id: "gap.generated-proof-evidence",
        missing: "Command, test, review, or static evidence for the generated claim.",
        closure_method: "Run a validation command and record the output as evidence.",
        blocks: ["claim.generated-readable"],
        severity: "warning",
        status: "open",
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.8,
        plain_language: "There is no recorded command, test, or review evidence yet."
      }
    ]
  };
}

export function createEvidenceIndex(proof = createProofArtifact(), { sourceId = "src.generated" } = {}) {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    evidence: proof.evidence.map((record) => ({
      id: record.id,
      type: record.type,
      claim_ids: [...record.supports],
      status: record.result,
      captured_at: record.captured_at,
      source: record.source,
      artifact_path: record.artifact_path,
      source_refs: record.source_refs ?? [sourceId],
      authority_state: record.authority_state ?? "repo_observed",
      approval_state: record.approval_state ?? "not_required",
      confidence: record.confidence ?? 0.8,
      redaction: "not_applicable",
      limitations: record.limitations.join(" "),
      plain_language: record.plain_language ?? "Evidence is listed here only when a concrete command, review, or source snapshot exists."
    }))
  };
}

export function createTraceArtifact({
  sourceId = "src.generated",
  planId = "PLAN-generated",
  componentId = "cmp.generated"
} = {}) {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    source_refs: [sourceId],
    relation_types: [...TRACE_RELATION_TYPES],
    relations: [
      {
        id: "trace.generated-plan-to-component",
        type: "implements",
        from: componentId,
        to: planId,
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "pending",
        confidence: 0.6
      },
      {
        id: "trace.generated-proof-obligation",
        type: "verifies",
        from: "PO-generated-structural-validity",
        to: "claim.generated-readable",
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "pending",
        confidence: 0.7
      },
      {
        id: "trace.generated-gap",
        type: "gapped_by",
        from: "claim.generated-readable",
        to: "gap.generated-proof-evidence",
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.8
      }
    ]
  };
}

export function createDebtArtifact({ sourceId = "src.generated" } = {}) {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    source_refs: [sourceId],
    records: [
      {
        id: "debt.generated-missing-evidence",
        type: "missing_evidence",
        subject: "claim.generated-readable",
        severity: "warning",
        source_refs: [sourceId],
        blocks: ["claim.generated-readable"],
        closure_method: "Attach validation evidence or keep the proof gap open.",
        status: "open",
        created_by: "seal.prove",
        summary: "Generated proof claim lacks evidence."
      }
    ]
  };
}

export function createFlyArtifact({ sourceId = "src.generated" } = {}) {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    id: "FLY-generated",
    objective: sourcedText("Exercise the smallest realistic version and feed learning back into the baseline.", sourceId, 0.7),
    smallest_real_world_version: sourcedText("A manual local validation run against the generated contract set.", sourceId, 0.7),
    assumptions_to_test: [
      sourcedRecord("assumption.generated-contracts-useful", "Generated contracts are structurally useful before real project intent is supplied.", sourceId, 0.6)
    ],
    stress_paths: [
      sourcedRecord("stress.generated-open-gaps", "Run validation with open gaps and confirm gaps are reported, not treated as proof.", sourceId, 0.7)
    ],
    failure_modes: [
      sourcedRecord("failure.generated-malformed-artifacts", "Malformed artifacts", sourceId, 0.8),
      sourcedRecord("failure.generated-false-proof", "Falsely proven claim", sourceId, 0.8),
      sourcedRecord("failure.generated-missing-authority", "Missing source authority", sourceId, 0.8)
    ],
    canary_or_manual_trial: sourcedText("Manual validation trial only; no deployment is performed.", sourceId, 0.7),
    evidence_to_collect: [
      sourcedRecord("evidence-plan.generated-schema-validation", "Schema validation result", sourceId, 0.8),
      sourcedRecord("evidence-plan.generated-proof-taxonomy", "Proof taxonomy result", sourceId, 0.8),
      sourcedRecord("evidence-plan.generated-source-authority", "Source authority result", sourceId, 0.8)
    ],
    telemetry: [
      sourcedRecord("telemetry.generated-validation-diagnostics", "Validation diagnostics", sourceId, 0.8)
    ],
    rollback_or_stop_rules: [
      sourcedRecord("stop.generated-conflicting-baseline", "Stop before code changes if PLAN, IMPACT, or PROVE are stale or conflicting.", sourceId, 0.8)
    ],
    learning_questions: [
      sourcedRecord("question.generated-srl-gaps", "What gaps block the next SRL level?", sourceId, 0.7),
      sourcedRecord("question.generated-baseline-updates", "What baseline updates are required?", sourceId, 0.7)
    ],
    results: [],
    learning: {
      plan_updates_required: [],
      map_updates_required: [],
      proof_updates_required: [
        sourcedRecord("learn.generated-proof-gap", "Close or explicitly carry forward gap.generated-proof-evidence.", sourceId, 0.8, {
          ref: "gap.generated-proof-evidence"
        })
      ],
      new_unknowns: [],
      retired_assumptions: [],
      new_debt: [
        sourcedRecord("learn.generated-debt", "Generated proof claim lacks evidence.", sourceId, 0.8, {
          ref: "debt.generated-missing-evidence"
        })
      ],
      next_fly_cycle: []
    },
    source_refs: [sourceId],
    authority_state: "repo_observed",
    approval_state: "pending",
    confidence: 0.6
  };
}

export function createContextPackArtifact({
  sourceId = "src.generated",
  target = "README.md",
  componentId = "cmp.generated",
  impactId = "IMPACT-generated"
} = {}) {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    generated_from: ".seal/*.yaml",
    notice: GENERATED_VIEW_NOTICE,
    target,
    budget: CONTEXT_PACK_BUDGET,
    included: [
      {
        id: target,
        kind: "file",
        reason: "directly_targeted",
        source_refs: [sourceId]
      },
      {
        id: componentId,
        kind: "component",
        reason: "owns_target_file",
        source_refs: [sourceId]
      }
    ],
    excluded: [],
    slices: {
      components: [componentId],
      files: [target],
      interfaces: [],
      dependencies: [],
      tests: [],
      proof_claims: ["claim.generated-readable"],
      gaps: ["gap.generated-proof-evidence"],
      impacts: [impactId]
    },
    source_refs: [sourceId]
  };
}

export function createMinimalArtifactSet({ sourceId = "src.generated", componentId = "cmp.generated" } = {}) {
  const source = createSourceRecord({ sourceId });
  const sources = createSourcesArtifact({ source });
  const ontology = createOntologyArtifact({ sourceId });
  const plan = createPlanArtifact({ sourceId, componentId });
  const map = createMapArtifact({ sourceId, componentId });
  const impact = createImpactArtifact({ sourceId, componentId });
  const proof = createProofArtifact({ sourceId });
  const evidenceIndex = createEvidenceIndex(proof, { sourceId });
  const trace = createTraceArtifact({ sourceId, componentId });
  const debt = createDebtArtifact({ sourceId });
  const fly = createFlyArtifact({ sourceId });
  const contextPack = createContextPackArtifact({ sourceId, componentId });

  return { sources, ontology, plan, map, trace, impact, proof, evidenceIndex, debt, fly, contextPack };
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
