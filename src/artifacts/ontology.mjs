import {
  ONTOLOGY_ACTION_TYPES,
  ONTOLOGY_ENTITY_TYPES,
  ONTOLOGY_STATE_TYPES,
  TRACE_RELATION_TYPES
} from "../contracts/constants.mjs";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pushError(errors, { path, code, expected, actual, fix, message }) {
  errors.push({ path, code, expected, actual, fix, message });
}

function validateKnownIds(errors, artifact, { key, allowed, code, label }) {
  const allowedSet = new Set(allowed);
  const seen = new Set();
  for (const [index, record] of asArray(artifact[key]).entries()) {
    const id = record?.id;
    if (!id) {
      continue;
    }
    if (seen.has(id)) {
      pushError(errors, {
        path: `/${key}/${index}/id`,
        code: "duplicate_id",
        expected: `unique ${label} id`,
        actual: id,
        fix: `Rename or remove the duplicate ${label} registry entry.`,
        message: `Ontology ${label} id "${id}" is duplicated.`
      });
    }
    seen.add(id);
    if (!allowedSet.has(id)) {
      pushError(errors, {
        path: `/${key}/${index}/id`,
        code,
        expected: [...allowedSet].join(", "),
        actual: id,
        fix: `Use a registered ${label} id or update the SEAL ontology constants before relying on it.`,
        message: `Ontology ${label} id "${id}" is not registered.`
      });
    }
  }
}

function validateCommandBindingRefs(errors, artifact) {
  const entityIds = new Set(asArray(artifact.entity_types).map((record) => record?.id).filter(Boolean));
  const relationshipIds = new Set(asArray(artifact.relationship_types).map((record) => record?.id).filter(Boolean));
  const actionIds = new Set(asArray(artifact.action_types).map((record) => record?.id).filter(Boolean));

  for (const [index, binding] of asArray(artifact.command_bindings).entries()) {
    for (const [field, knownIds] of [
      ["consumes", entityIds],
      ["emits", entityIds],
      ["relationships", relationshipIds],
      ["actions", actionIds]
    ]) {
      for (const [refIndex, ref] of asArray(binding?.[field]).entries()) {
        if (!knownIds.has(ref)) {
          pushError(errors, {
            path: `/command_bindings/${index}/${field}/${refIndex}`,
            code: `unknown_${field.slice(0, -1)}_ref`,
            expected: [...knownIds].join(", "),
            actual: ref,
            fix: `Use an id defined in ontology.${field === "relationships" ? "relationship_types" : field === "actions" ? "action_types" : "entity_types"}.`,
            message: `Command binding "${binding?.command ?? index}" references unknown ${field} id "${ref}".`
          });
        }
      }
    }
  }

  const reloadAction = artifact.canonical_reload?.action_type;
  if (reloadAction && !actionIds.has(reloadAction)) {
    pushError(errors, {
      path: "/canonical_reload/action_type",
      code: "unknown_action_ref",
      expected: [...actionIds].join(", "),
      actual: reloadAction,
      fix: "Use an action_type defined in ontology.action_types.",
      message: `canonical_reload references unknown action "${reloadAction}".`
    });
  }
}

export function validateOntologyContract(artifact) {
  const errors = [];

  validateKnownIds(errors, artifact, {
    key: "entity_types",
    allowed: ONTOLOGY_ENTITY_TYPES,
    code: "unknown_entity_type",
    label: "entity type"
  });
  validateKnownIds(errors, artifact, {
    key: "relationship_types",
    allowed: TRACE_RELATION_TYPES,
    code: "unknown_relationship_type",
    label: "relationship type"
  });
  validateKnownIds(errors, artifact, {
    key: "action_types",
    allowed: ONTOLOGY_ACTION_TYPES,
    code: "unknown_action_type",
    label: "action type"
  });
  validateKnownIds(errors, artifact, {
    key: "state_types",
    allowed: ONTOLOGY_STATE_TYPES,
    code: "unknown_state_type",
    label: "state type"
  });
  validateCommandBindingRefs(errors, artifact);

  return {
    valid: errors.length === 0,
    errors
  };
}
