import {
  AUTHORITY_STATES,
  MAP_FILE_CLASSIFICATIONS,
  ONTOLOGY_ACTION_TYPES,
  ONTOLOGY_ENTITY_TYPES,
  ONTOLOGY_STATE_TYPES,
  APPROVAL_STATES,
  TRACE_RELATION_TYPES
} from "../contracts/constants.mjs";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pushError(errors, { path, code, expected, actual, fix, message }) {
  errors.push({ path, code, expected, actual, fix, message });
}

function expectedList(values) {
  return [...values].join(", ");
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
        expected: expectedList(allowedSet),
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
            expected: expectedList(knownIds),
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
      expected: expectedList(actionIds),
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

function validateTypedRecord(errors, record, path, expectedType) {
  if (!record || typeof record !== "object") {
    return;
  }
  if (record.ontology_type && !ONTOLOGY_ENTITY_TYPES.includes(record.ontology_type)) {
    pushError(errors, {
      path: `${path}/ontology_type`,
      code: "unknown_map_entity_type",
      expected: ONTOLOGY_ENTITY_TYPES.join(", "),
      actual: record.ontology_type,
      fix: "Use an ontology_type from .seal/ontology.yaml entity_types.",
      message: `MAP record uses unknown ontology_type "${record.ontology_type}".`
    });
  }
  if (record.ontology_type && record.ontology_type !== expectedType) {
    pushError(errors, {
      path: `${path}/ontology_type`,
      code: "invalid_map_entity_type",
      expected: expectedType,
      actual: record.ontology_type,
      fix: `Set ontology_type to "${expectedType}" for this MAP record or move the fact to a supported collection.`,
      message: `MAP record type "${record.ontology_type}" does not match expected type "${expectedType}".`
    });
  }
  if ("ontology_id" in record && String(record.ontology_id ?? "").length === 0) {
    pushError(errors, {
      path: `${path}/ontology_id`,
      code: "missing_map_object_id",
      expected: "stable non-empty ontology object id",
      actual: "empty",
      fix: "Provide a stable ontology_id derived from the canonical MAP record id or path.",
      message: "MAP record ontology_id must be non-empty when present."
    });
  }
}

export function validateMapOntologyContract(map) {
  const errors = [];
  const classifications = new Set(MAP_FILE_CLASSIFICATIONS);
  const relationships = new Set(TRACE_RELATION_TYPES);

  validateTypedRecord(errors, map, "/map", "map");
  asArray(map.sources).forEach((record, index) => validateTypedRecord(errors, record, `/sources/${index}`, "source"));
  asArray(map.components).forEach((record, index) => validateTypedRecord(errors, record, `/components/${index}`, "component"));
  asArray(map.files).forEach((record, index) => {
    validateTypedRecord(errors, record, `/files/${index}`, "file");
    if (record?.classification && !classifications.has(record.classification)) {
      pushError(errors, {
        path: `/files/${index}/classification`,
        code: "unknown_map_file_classification",
        expected: expectedList(classifications),
        actual: record.classification,
        fix: "Use a supported MAP file classification or mark the file as unknown with a visible gap.",
        message: `MAP file classification "${record.classification}" is not supported.`
      });
    }
  });
  asArray(map.dependencies).forEach((record, index) => validateTypedRecord(errors, record, `/dependencies/${index}`, "dependency"));
  asArray(map.services?.discovered ?? map.services).forEach((record, index) => validateTypedRecord(errors, record, `/services/discovered/${index}`, "service"));
  asArray(map.interfaces).forEach((record, index) => validateTypedRecord(errors, record, `/interfaces/${index}`, "interface"));
  asArray(map.data_stores).forEach((record, index) => validateTypedRecord(errors, record, `/data_stores/${index}`, "data_store"));
  asArray(map.tests).forEach((record, index) => validateTypedRecord(errors, record, `/tests/${index}`, "test"));
  asArray(map.unknowns).forEach((record, index) => validateTypedRecord(errors, record, `/unknowns/${index}`, "gap"));
  asArray(map.gaps).forEach((record, index) => validateTypedRecord(errors, record, `/gaps/${index}`, "gap"));
  asArray(map.drift).forEach((record, index) => validateTypedRecord(errors, record, `/drift/${index}`, "gap"));

  asArray(map.relationships).forEach((record, index) => {
    validateTypedRecord(errors, record, `/relationships/${index}`, "trace_relation");
    if (!relationships.has(record?.type)) {
      pushError(errors, {
        path: `/relationships/${index}/type`,
        code: "unknown_map_relationship_type",
        expected: expectedList(relationships),
        actual: record?.type,
        fix: "Use an ontology relationship type or convert the unsupported edge into a visible gap.",
        message: `MAP relationship type "${record?.type}" is not in the ontology relationship registry.`
      });
    }
  });

  asArray(map.trace_links).forEach((record, index) => {
    const relationship = record?.relationship ?? record?.type;
    if (relationship && !relationships.has(relationship)) {
      pushError(errors, {
        path: `/trace_links/${index}/relationship`,
        code: "unknown_map_relationship_type",
        expected: expectedList(relationships),
        actual: relationship,
        fix: "Use an ontology relationship type or keep the unsupported trace as a gap.",
        message: `MAP trace relationship "${relationship}" is not in the ontology relationship registry.`
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

const RELOAD_REQUIRED_ACTIONS = new Set([
  "validate",
  "validate_artifacts",
  "generate_view",
  "render_generated_view",
  "close_bead",
  "fly_record"
]);

function validateFlyActions(errors, fly) {
  const actionTypes = new Set(ONTOLOGY_ACTION_TYPES);
  const actionIds = new Set();
  let reloadSeen = false;

  for (const [index, action] of asArray(fly.actions).entries()) {
    const path = `/actions/${index}`;
    if (!action?.id) {
      continue;
    }
    actionIds.add(action.id);
    if (!actionTypes.has(action.action_type)) {
      pushError(errors, {
        path: `${path}/action_type`,
        code: "unknown_fly_action_type",
        expected: expectedList(actionTypes),
        actual: action.action_type,
        fix: "Use an action_type defined by .seal/ontology.yaml action_types.",
        message: `FLY action "${action.id}" uses unknown ontology action "${action.action_type}".`
      });
    }
    if (action.action_type === "reload_canonical" || action.action_type === "canonical_reload") {
      reloadSeen = true;
    } else if (RELOAD_REQUIRED_ACTIONS.has(action.action_type) && !reloadSeen) {
      pushError(errors, {
        path: `${path}/action_type`,
        code: "missing_reload_before_action",
        expected: "reload_canonical action earlier in fly.actions",
        actual: action.action_type,
        fix: "Record reload_canonical before validation, generated-view, closure, or FLY recording actions that rely on persisted .seal YAML.",
        message: `FLY action "${action.id}" relies on canonical artifacts before reload_canonical was recorded.`
      });
    }
  }

  return actionIds;
}

function validateFlyStateTransitions(errors, fly, actionIds) {
  const stateTypes = new Set(ONTOLOGY_STATE_TYPES);
  const valueStates = new Set([...ONTOLOGY_STATE_TYPES, ...AUTHORITY_STATES, ...APPROVAL_STATES, "accepted", "failed", "passed", "current"]);

  for (const [index, transition] of asArray(fly.state_transitions).entries()) {
    const path = `/state_transitions/${index}`;
    if (!stateTypes.has(transition?.state_type)) {
      pushError(errors, {
        path: `${path}/state_type`,
        code: "unknown_fly_state_type",
        expected: expectedList(stateTypes),
        actual: transition?.state_type,
        fix: "Use a state_type defined by .seal/ontology.yaml state_types.",
        message: `FLY state transition "${transition?.id ?? index}" uses unknown ontology state type "${transition?.state_type}".`
      });
    }
    for (const field of ["from_state", "to_state"]) {
      if (transition?.[field] && !valueStates.has(transition[field])) {
        pushError(errors, {
          path: `${path}/${field}`,
          code: "unknown_fly_state_value",
          expected: expectedList(valueStates),
          actual: transition[field],
          fix: "Use an ontology state, authority state, approval state, or supported proof/evidence result value.",
          message: `FLY transition "${transition?.id ?? index}" uses unknown ${field} "${transition[field]}".`
        });
      }
    }
    if (transition?.action_ref && !actionIds.has(transition.action_ref)) {
      pushError(errors, {
        path: `${path}/action_ref`,
        code: "unknown_fly_action_ref",
        expected: expectedList(actionIds),
        actual: transition.action_ref,
        fix: "Reference an action id recorded in fly.actions.",
        message: `FLY transition "${transition?.id ?? index}" references missing action "${transition.action_ref}".`
      });
    }
  }
}

export function validateFlyOntologyContract(fly) {
  const errors = [];
  const actionIds = validateFlyActions(errors, fly);
  validateFlyStateTransitions(errors, fly, actionIds);

  return {
    valid: errors.length === 0,
    errors
  };
}
