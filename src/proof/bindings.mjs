import { ONTOLOGY_ENTITY_TYPES } from "../contracts/constants.mjs";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function pushError(errors, { code, path, expected, actual, fix, message }) {
  errors.push({ code, path, expected, actual, fix, message });
}

function addObject(objects, id, type, path) {
  if (!id) {
    return;
  }
  const objectId = String(id);
  if (!objects.has(objectId)) {
    objects.set(objectId, { type, path });
  }
}

function addRecord(objects, record, type, path, fields = ["ontology_id", "id"]) {
  if (!record || typeof record !== "object") {
    return;
  }
  for (const field of fields) {
    addObject(objects, record[field], type, `${path}/${field}`);
  }
}

function buildOntologyObjectIndex(artifactSet = {}) {
  const objects = new Map();
  const ontology = artifactSet.ontology ?? {};
  const map = artifactSet.map ?? {};
  const proof = artifactSet.proof ?? {};
  const evidenceIndex = artifactSet.evidenceIndex ?? {};
  const impacts = Array.isArray(artifactSet.impacts) ? artifactSet.impacts : [artifactSet.impact].filter(Boolean);

  addRecord(objects, ontology, "ontology", "/ontology", ["ontology_id", "id"]);
  addRecord(objects, map, "map", "/map", ["ontology_id", "id"]);
  asList(map.sources).forEach((record, index) => addRecord(objects, record, "source", `/map/sources/${index}`));
  asList(map.components).forEach((record, index) => addRecord(objects, record, "component", `/map/components/${index}`));
  asList(map.files).forEach((record, index) => addRecord(objects, record, "file", `/map/files/${index}`, ["ontology_id", "path", "id"]));
  asList(map.dependencies).forEach((record, index) => addRecord(objects, record, "dependency", `/map/dependencies/${index}`, ["ontology_id", "id", "name"]));
  asList(map.services?.discovered ?? map.services).forEach((record, index) => addRecord(objects, record, "service", `/map/services/discovered/${index}`, ["ontology_id", "id", "name"]));
  asList(map.interfaces).forEach((record, index) => addRecord(objects, record, "interface", `/map/interfaces/${index}`, ["ontology_id", "id", "name"]));
  asList(map.data_stores).forEach((record, index) => addRecord(objects, record, "data_store", `/map/data_stores/${index}`, ["ontology_id", "id", "name"]));
  asList(map.tests).forEach((record, index) => addRecord(objects, record, "test", `/map/tests/${index}`, ["ontology_id", "id", "path"]));
  asList(map.unknowns).forEach((record, index) => addRecord(objects, record, "gap", `/map/unknowns/${index}`));
  asList(map.gaps).forEach((record, index) => addRecord(objects, record, "gap", `/map/gaps/${index}`));
  asList(map.drift).forEach((record, index) => addRecord(objects, record, "gap", `/map/drift/${index}`));
  asList(map.requirements).forEach((record, index) => addRecord(objects, record, "requirement", `/map/requirements/${index}`));
  asList(map.risks).forEach((record, index) => addRecord(objects, record, "risk", `/map/risks/${index}`));
  asList(map.assumptions).forEach((record, index) => addRecord(objects, record, "assumption", `/map/assumptions/${index}`));
  asList(map.trace_links).forEach((record, index) => addRecord(objects, record, "trace_relation", `/map/trace_links/${index}`));
  asList(map.relationships).forEach((record, index) => addRecord(objects, record, "trace_relation", `/map/relationships/${index}`));
  asList(map.launch_gates).forEach((record, index) => addRecord(objects, record, "requirement", `/map/launch_gates/${index}`));

  impacts.forEach((impact, impactIndex) => {
    addRecord(objects, impact, "impact", `/impacts/${impactIndex}`);
    for (const [section, records] of Object.entries(impact.affected ?? {})) {
      asList(records).forEach((record, recordIndex) => addRecord(objects, record, record.kind ?? section, `/impacts/${impactIndex}/affected/${section}/${recordIndex}`));
    }
    asList(impact.proof_required).forEach((record, recordIndex) => addRecord(objects, record, "claim", `/impacts/${impactIndex}/proof_required/${recordIndex}`));
    asList(impact.approval_needed).forEach((record, recordIndex) => addRecord(objects, record, "assumption", `/impacts/${impactIndex}/approval_needed/${recordIndex}`));
    asList(impact.blocking_unknowns).forEach((record, recordIndex) => addRecord(objects, record, "gap", `/impacts/${impactIndex}/blocking_unknowns/${recordIndex}`));
    asList(impact.gaps).forEach((record, recordIndex) => addRecord(objects, record, "gap", `/impacts/${impactIndex}/gaps/${recordIndex}`));
  });

  asList(proof.claims).forEach((record, index) => addRecord(objects, record, "claim", `/proof/claims/${index}`));
  asList(proof.evidence).forEach((record, index) => addRecord(objects, record, "evidence", `/proof/evidence/${index}`));
  asList(proof.gaps).forEach((record, index) => addRecord(objects, record, "gap", `/proof/gaps/${index}`));
  asList(evidenceIndex.evidence).forEach((record, index) => addRecord(objects, record, "evidence", `/evidenceIndex/evidence/${index}`));
  asList(artifactSet.trace?.relations).forEach((record, index) => addRecord(objects, record, "trace_relation", `/trace/relations/${index}`));

  return objects;
}

function buildById(records) {
  const index = new Map();
  for (const record of records) {
    if (record?.id && !index.has(record.id)) {
      index.set(record.id, record);
    }
  }
  return index;
}

function mergedEvidenceById(proof, evidenceIndex) {
  const byId = new Map();
  for (const record of asList(proof?.evidence)) {
    if (record?.id) {
      byId.set(record.id, { ...record });
    }
  }
  for (const record of asList(evidenceIndex?.evidence)) {
    if (record?.id) {
      byId.set(record.id, { ...(byId.get(record.id) ?? {}), ...record });
    }
  }
  return byId;
}

function evidenceState(evidence) {
  const value = String(evidence?.status ?? evidence?.result ?? "unknown").toLowerCase();
  if (value.includes("failed") || value === "fail") return "failed";
  if (value.includes("stale")) return "stale";
  if (value.includes("incomplete") || value.includes("missing")) return "incomplete";
  if (value.includes("unknown")) return "unknown";
  if (value.includes("passed") || value === "pass") return "passed";
  return value;
}

function objectRefs(record) {
  return asList(record?.object_refs);
}

function validateOntologyFields(errors, record, path, expectedType, entityTypes) {
  if (!record || typeof record !== "object") {
    return;
  }
  if (record.ontology_type && !entityTypes.has(record.ontology_type)) {
    pushError(errors, {
      code: "unknown_ontology_type",
      path: `${path}/ontology_type`,
      expected: [...entityTypes].join(", "),
      actual: record.ontology_type,
      fix: "Use an entity type declared by .seal/ontology.yaml.",
      message: `Proof record uses unknown ontology_type "${record.ontology_type}".`
    });
  }
  if (record.ontology_type && record.ontology_type !== expectedType) {
    pushError(errors, {
      code: "invalid_ontology_type",
      path: `${path}/ontology_type`,
      expected: expectedType,
      actual: record.ontology_type,
      fix: `Set ontology_type to "${expectedType}" for this proof record.`,
      message: `Proof record type "${record.ontology_type}" does not match expected type "${expectedType}".`
    });
  }
  if ("ontology_id" in record && String(record.ontology_id ?? "").length === 0) {
    pushError(errors, {
      code: "missing_ontology_id",
      path: `${path}/ontology_id`,
      expected: "stable non-empty ontology object id",
      actual: "empty",
      fix: "Provide a stable ontology_id derived from the canonical proof record id.",
      message: "Proof ontology_id must be non-empty when present."
    });
  }
}

function validateBoundObjects(errors, record, path, label, objects) {
  const refs = objectRefs(record);
  if (refs.length === 0) {
    pushError(errors, {
      code: "missing_bound_object",
      path: `${path}/object_refs`,
      expected: `${label} object_refs pointing at known ontology object ids`,
      actual: "missing",
      fix: "Add object_refs for the MAP, proof, evidence, gap, or trace objects this record targets.",
      message: `${label} must bind to at least one ontology object id.`
    });
    return;
  }

  refs.forEach((ref, index) => {
    if (!objects.has(ref)) {
      pushError(errors, {
        code: "unknown_bound_object",
        path: `${path}/object_refs/${index}`,
        expected: "known object id from .seal/ontology.yaml, MAP, proof, evidence, gaps, impacts, or trace records",
        actual: ref,
        fix: "Correct the object_refs entry, add the target object to the canonical artifact set, or record a visible gap.",
        message: `${label} binds to unknown ontology object id "${ref}".`
      });
    }
  });
}

function validateProvenClaim(errors, claim, claimIndex, evidenceById, gapById) {
  if (claim.status !== "proven") {
    return;
  }

  const evidenceRefs = asList(claim.evidence_refs);
  const gapRefs = asList(claim.gap_refs);

  if (evidenceRefs.length === 0) {
    pushError(errors, {
      code: "missing_proof_evidence",
      path: `/proof/claims/${claimIndex}/evidence_refs`,
      expected: "at least one current passed evidence record",
      actual: "empty",
      fix: "Attach current passed evidence before marking the claim proven.",
      message: `Claim ${claim.id} is proven without evidence_refs.`
    });
  }

  evidenceRefs.forEach((evidenceId, evidenceIndex) => {
    const evidence = evidenceById.get(evidenceId);
    const state = evidenceState(evidence);
    if (!evidence || state !== "passed") {
      pushError(errors, {
        code: !evidence ? "missing_proof_evidence" : `${state}_proof_evidence`,
        path: `/proof/claims/${claimIndex}/evidence_refs/${evidenceIndex}`,
        expected: "current passed evidence record",
        actual: !evidence ? "missing" : state,
        fix: "Replace the evidence with a current passed record or keep the claim gapped.",
        message: `Claim ${claim.id} cannot be proven by evidence ${evidenceId} in state ${!evidence ? "missing" : state}.`
      });
    }
  });

  if (claim.freshness?.status && claim.freshness.status !== "current") {
    pushError(errors, {
      code: "stale_proof_claim",
      path: `/proof/claims/${claimIndex}/freshness/status`,
      expected: "current",
      actual: claim.freshness.status,
      fix: "Refresh the evidence chain before marking this claim proven.",
      message: `Claim ${claim.id} is proven with ${claim.freshness.status} freshness.`
    });
  }

  gapRefs.forEach((gapId, gapIndex) => {
    const gap = gapById.get(gapId);
    const status = gap?.status ?? "missing";
    if (status !== "closed") {
      pushError(errors, {
        code: status === "missing" ? "missing_proof_gap" : "unresolved_blocking_gap",
        path: `/proof/claims/${claimIndex}/gap_refs/${gapIndex}`,
        expected: "no unresolved blocking gap_refs on a proven claim",
        actual: status,
        fix: "Close the gap, move the claim back to gapped, or make the accepted assumption explicit outside proven status.",
        message: `Claim ${claim.id} is proven while gap ${gapId} is ${status}.`
      });
    }
  });
}

export function validateProofOntologyBindings(artifactSet = {}) {
  const proof = artifactSet.proof ?? {};
  const evidenceIndex = artifactSet.evidenceIndex ?? {};
  const entityTypes = new Set(asList(artifactSet.ontology?.entity_types).map((record) => record?.id).filter(Boolean));
  if (entityTypes.size === 0) {
    for (const type of ONTOLOGY_ENTITY_TYPES) {
      entityTypes.add(type);
    }
  }

  const objects = buildOntologyObjectIndex(artifactSet);
  const evidenceById = mergedEvidenceById(proof, evidenceIndex);
  const gapById = buildById(asList(proof.gaps));
  const errors = [];

  asList(proof.claims).forEach((claim, index) => {
    const path = `/proof/claims/${index}`;
    validateOntologyFields(errors, claim, path, "claim", entityTypes);
    validateBoundObjects(errors, claim, path, `Proof claim ${claim?.id ?? index}`, objects);
    validateProvenClaim(errors, claim, index, evidenceById, gapById);
  });

  asList(proof.evidence).forEach((evidence, index) => {
    const path = `/proof/evidence/${index}`;
    validateOntologyFields(errors, evidence, path, "evidence", entityTypes);
    validateBoundObjects(errors, evidence, path, `Proof evidence ${evidence?.id ?? index}`, objects);
  });

  asList(proof.gaps).forEach((gap, index) => {
    const path = `/proof/gaps/${index}`;
    validateOntologyFields(errors, gap, path, "gap", entityTypes);
    validateBoundObjects(errors, gap, path, `Proof gap ${gap?.id ?? index}`, objects);
  });

  asList(evidenceIndex.evidence).forEach((evidence, index) => {
    const path = `/evidenceIndex/evidence/${index}`;
    validateOntologyFields(errors, evidence, path, "evidence", entityTypes);
    validateBoundObjects(errors, evidence, path, `Evidence index record ${evidence?.id ?? index}`, objects);
  });

  return {
    valid: errors.length === 0,
    errors,
    objects
  };
}
