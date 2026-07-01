import { ONTOLOGY_ENTITY_TYPES, ONTOLOGY_STATE_TYPES, TRACE_RELATION_TYPES } from "../contracts/constants.mjs";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function recordId(record) {
  return record?.id ?? record?.path ?? record?.ref ?? record?.name;
}

function ids(records) {
  return asList(records).map(recordId).filter(Boolean);
}

function ontologySet(ontology, key, fallback) {
  const records = asList(ontology?.[key]);
  return new Set(records.length > 0 ? ids(records) : fallback);
}

export function createOntologyViewModel({ ontology, map, trace, proof, debt, impacts = [], flyRecords = [] } = {}) {
  const entityTypes = ontologySet(ontology, "entity_types", ONTOLOGY_ENTITY_TYPES);
  const relationshipTypes = ontologySet(ontology, "relationship_types", TRACE_RELATION_TYPES);
  const stateTypes = ontologySet(ontology, "state_types", ONTOLOGY_STATE_TYPES);
  const actionTypes = ontologySet(ontology, "action_types", []);
  const commandBindings = asList(ontology?.command_bindings);

  const proofStates = new Set([
    ...asList(proof?.claims).map((record) => record.status),
    ...asList(proof?.evidence).map((record) => record.result ?? record.status),
    ...asList(proof?.gaps).map((record) => record.status)
  ].filter(Boolean));
  const approvalStates = new Set([
    ...asList(map?.components).map((record) => record.approval_state),
    ...asList(map?.files).map((record) => record.approval_state),
    ...asList(proof?.claims).map((record) => record.approval_state),
    ...asList(debt?.records).map((record) => record.approval_state),
    ...asList(impacts).flatMap((impact) => asList(impact.approval_needed).map((record) => record.status))
  ].filter(Boolean));
  const gapStates = new Set([
    ...asList(map?.gaps).map((record) => record.status),
    ...asList(map?.unknowns).map((record) => record.status),
    ...asList(proof?.gaps).map((record) => record.status),
    ...asList(debt?.records).map((record) => record.status),
    ...asList(impacts).flatMap((impact) => [
      ...asList(impact.gaps).map((record) => record.status),
      ...asList(impact.blocking_unknowns).map((record) => record.status)
    ])
  ].filter(Boolean));
  const actionRecords = asList(flyRecords).flatMap((fly) => asList(fly.actions));
  const stateTransitions = asList(flyRecords).flatMap((fly) => asList(fly.state_transitions));

  return {
    ontology_id: ontology?.id ?? "not recorded",
    generated_from: ".seal/ontology.yaml",
    entity_types: [...entityTypes].sort(),
    relationship_types: [...relationshipTypes].sort(),
    state_types: [...stateTypes].sort(),
    action_types: [...actionTypes].sort(),
    command_bindings: commandBindings.map((binding) => ({
      command: binding.command,
      consumes: asList(binding.consumes).filter((item) => entityTypes.has(item)),
      emits: asList(binding.emits).filter((item) => entityTypes.has(item)),
      relationships: asList(binding.relationships).filter((item) => relationshipTypes.has(item)),
      actions: asList(binding.actions).filter((item) => actionTypes.has(item))
    })),
    observed_states: {
      proof: [...proofStates].sort(),
      approval: [...approvalStates].sort(),
      gap: [...gapStates].sort(),
      risk: "not recorded"
    },
    records: {
      components: ids(map?.components),
      files: asList(map?.files).map((file) => file.path).filter(Boolean),
      relationships: [
        ...asList(trace?.relations).map((record) => ({ id: record.id, type: record.type })),
        ...asList(map?.relationships).map((record) => ({ id: record.id, type: record.type }))
      ].filter((record) => relationshipTypes.has(record.type)),
      claims: ids(proof?.claims),
      evidence: ids(proof?.evidence),
      gaps: [...ids(map?.gaps), ...ids(map?.unknowns), ...ids(proof?.gaps)],
      debt: ids(debt?.records),
      actions: actionRecords.map((record) => ({ id: record.id, action_type: record.action_type })).filter((record) => actionTypes.has(record.action_type)),
      state_transitions: stateTransitions.map((record) => ({ id: record.id, state_type: record.state_type })).filter((record) => stateTypes.has(record.state_type))
    },
    not_recorded: [
      ...(proofStates.size === 0 ? ["proof_state"] : []),
      ...(approvalStates.size === 0 ? ["approval_state"] : []),
      ...(gapStates.size === 0 ? ["gap_state"] : []),
      "risk_state"
    ]
  };
}

export function ontologyViewMarkdown(model) {
  return [
    "## Ontology Model",
    "",
    `- Ontology: ${model.ontology_id} [ontology:${model.ontology_id}]`,
    `- Generated from: ${model.generated_from} [artifact:${model.generated_from}]`,
    `- Entity types used: ${model.entity_types.join(", ") || "not recorded"} [ontology:entity_types]`,
    `- Relationship types used: ${model.relationship_types.join(", ") || "not recorded"} [ontology:relationship_types]`,
    `- Proof states: ${model.observed_states.proof.join(", ") || "not recorded"} [ontology:proof_state]`,
    `- Approval states: ${model.observed_states.approval.join(", ") || "not recorded"} [ontology:approval_state]`,
    `- Gap states: ${model.observed_states.gap.join(", ") || "not recorded"} [ontology:gap_state]`,
    `- Risk states: ${model.observed_states.risk} [ontology:risk_state]`,
    `- Not recorded markers: ${model.not_recorded.join(", ") || "none"} [gap:ontology.not_recorded]`,
    ""
  ].join("\n");
}
