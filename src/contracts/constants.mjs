export const CONTRACT_SCHEMA_VERSION = "0.2.0";

export const SOURCE_AUTHORITY_KINDS = Object.freeze([
  "human_input",
  "repo_observation",
  "command_execution",
  "external_source_snapshot",
  "mathematical_or_code_proof",
  "inference",
  "unknown"
]);

export const AUTHORITY_STATES = Object.freeze([
  "human_approved",
  "repo_observed",
  "externally_sourced",
  "execution_evidence",
  "mathematically_proven",
  "inferred",
  "unknown"
]);

export const APPROVAL_STATES = Object.freeze([
  "approved",
  "pending",
  "rejected",
  "not_required"
]);

export const PLAN_STATUSES = Object.freeze([
  "draft",
  "proposed",
  "approved",
  "superseded",
  "rejected"
]);

export const TRACE_RELATION_TYPES = Object.freeze([
  "satisfies",
  "implements",
  "depends_on",
  "exposes",
  "consumes",
  "produces",
  "verifies",
  "mitigates",
  "blocks",
  "supersedes",
  "conflicts_with",
  "owned_by",
  "configured_by",
  "observed_in",
  "proven_by",
  "gapped_by"
]);

export const ONTOLOGY_ENTITY_TYPES = Object.freeze([
  "ontology",
  "plan",
  "map",
  "proof",
  "source",
  "component",
  "file",
  "dependency",
  "service",
  "interface",
  "data_store",
  "test",
  "requirement",
  "risk",
  "assumption",
  "trace_relation",
  "impact",
  "claim",
  "evidence",
  "gap",
  "debt",
  "fly_cycle",
  "state_transition",
  "generated_view",
  "validation_result"
]);

export const ONTOLOGY_ACTION_TYPES = Object.freeze([
  "canonical_reload",
  "repo_observe",
  "plan_ingest",
  "map_emit",
  "impact_traverse",
  "prove_bind",
  "fly_record_transition",
  "validate_artifacts",
  "render_generated_view"
]);

export const ONTOLOGY_STATE_TYPES = Object.freeze([
  "draft",
  "observed",
  "inferred",
  "approved",
  "pending",
  "gapped",
  "proven",
  "rejected",
  "stale",
  "open",
  "closed",
  "blocked",
  "ready",
  "flying",
  "learned"
]);

export const CLAIM_STATUSES = Object.freeze([
  "proven",
  "gapped",
  "rejected",
  "stale",
  "conflicted"
]);

export const CLAIM_TYPES = Object.freeze([
  "functional",
  "safety",
  "reliability",
  "security",
  "performance",
  "usability",
  "launch",
  "operational",
  "data",
  "cost",
  "accessibility",
  "architecture"
]);

export const EVIDENCE_TYPES = Object.freeze([
  "unit_test",
  "integration_test",
  "e2e_test",
  "contract_test",
  "schema_validation",
  "migration_dry_run",
  "typecheck",
  "lint",
  "static_analysis",
  "security_scan",
  "accessibility_check",
  "visual_review",
  "screenshot",
  "browser_recording",
  "performance_measurement",
  "cost_calculation",
  "load_test",
  "fault_injection",
  "property_based_test",
  "model_check",
  "mathematical_analysis",
  "telemetry",
  "canary_result",
  "human_approval",
  "external_source_snapshot",
  "repo_observation",
  "command_output",
  "static_inspection",
  "external_reference",
  "gap_record",
  "test_result"
]);

export const DEBT_TYPES = Object.freeze([
  "unknown_file",
  "orphan_component",
  "missing_owner",
  "missing_requirement",
  "missing_test",
  "missing_evidence",
  "stale_evidence",
  "broken_trace",
  "unapproved_inference",
  "risky_dependency",
  "hidden_service",
  "cost_unknown",
  "schema_without_migration",
  "interface_without_contract",
  "plan_code_divergence"
]);

export const CONTEXT_PACK_BUDGET = Object.freeze({
  max_bytes: 50000,
  max_records: Object.freeze({
    components: 8,
    files: 30,
    proof_claims: 30,
    gaps: 30
  }),
  full_artifact_dump_allowed: false
});

export const GENERATED_VIEW_NOTICE = "Generated from .seal/*.yaml. Do not edit by hand.";

export const SRL_LEVELS = Object.freeze([
  {
    level: 0,
    name: "Spark",
    exit_criteria: ["Idea or pain captured"]
  },
  {
    level: 1,
    name: "Problem",
    entry_criteria: ["Idea or pain exists"],
    exit_criteria: ["User, pain, objective, non-goals, and trade priorities are defined"]
  },
  {
    level: 2,
    name: "Scenario",
    entry_criteria: ["Problem framing exists"],
    exit_criteria: ["Nominal and off-nominal scenarios and critical events are defined"]
  },
  {
    level: 3,
    name: "Architecture",
    entry_criteria: ["Scenarios exist"],
    exit_criteria: ["Components, interfaces, data stores, dependencies, and boundaries are mapped"]
  },
  {
    level: 4,
    name: "Proof Plan",
    entry_criteria: ["Architecture intent or observed architecture exists"],
    exit_criteria: [
      "Requirements have acceptance criteria",
      "Critical scenarios exist",
      "Public interfaces have contracts or explicit gaps",
      "Data stores have schema or invariant proof obligations",
      "Risk-bearing flows have off-nominal scenarios",
      "Proof methods are assigned",
      "Approval needs are known",
      "All unknowns are visible"
    ]
  },
  {
    level: 5,
    name: "Build",
    entry_criteria: ["Proof obligations exist before code"],
    exit_criteria: ["Implementation satisfies local proof obligations"]
  },
  {
    level: 6,
    name: "Integrate",
    entry_criteria: ["Build-level proof exists"],
    exit_criteria: ["Components work together through declared interfaces"]
  },
  {
    level: 7,
    name: "Stress",
    entry_criteria: ["Integrated flows exist"],
    exit_criteria: ["Failure modes, edge cases, and budgets are tested"]
  },
  {
    level: 8,
    name: "Fly",
    entry_criteria: ["Stress evidence exists"],
    exit_criteria: ["MVP, canary, or staging is exposed to realistic use with stop rules"]
  },
  {
    level: 9,
    name: "Learn",
    entry_criteria: ["Real-world evidence exists"],
    exit_criteria: ["Real-world evidence updates map, plan, debt, and proof records"]
  }
]);

export const QUESTION_DECISION_TREE = Object.freeze([
  {
    field: "plan.user",
    ask_when: "Stakeholder or persona is missing or conflicting.",
    question: "Who is this for?"
  },
  {
    field: "plan.pain",
    ask_when: "The painful job or user problem is missing.",
    question: "What painful job should it do?"
  },
  {
    field: "plan.acceptance_criteria",
    ask_when: "Acceptance criteria or proof target is missing.",
    question: "What would make you say it worked?"
  },
  {
    field: "risk.never_happen",
    ask_when: "Risk, security, data, money, privacy, or irreversible state is touched.",
    question: "What must never happen?"
  },
  {
    field: "risk.harm",
    ask_when: "Data, money, privacy, safety, reputation, or compliance exposure is possible.",
    question: "What data, money, privacy, or reputation could be harmed?"
  },
  {
    field: "plan.trade_priorities",
    ask_when: "Speed, cost, UX, reliability, safety, or accuracy tradeoffs conflict.",
    question: "What matters most: speed, cost, UX, reliability, safety, or accuracy?"
  },
  {
    field: "fly.smallest_real_world_version",
    ask_when: "Fly or MVP scope is unclear.",
    question: "What is the smallest real-world version we can fly first?"
  }
]);
