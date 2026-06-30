const typedAffectedTargets = Object.freeze({
  requirements: "requirements",
  components: "components",
  files: "files",
  interfaces: "interfaces",
  invariants: "invariants",
  schemas: "schemas",
  tests: "tests"
});

const typedAffectedKinds = Object.freeze({
  requirements: "requirement",
  components: "component",
  files: "file",
  interfaces: "interface",
  invariants: "invariant",
  schemas: "schema",
  tests: "test"
});

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function addError(errors, code, path, message) {
  errors.push({ code, path, message });
}

function addId(indexes, id, type, path, errors, { allowDuplicate = false } = {}) {
  if (!id) {
    return;
  }

  const existing = indexes.all.get(id);
  if (existing && !allowDuplicate) {
    addError(errors, "duplicate_id", path, `Duplicate SEAL id "${id}" already defined at ${existing.path}.`);
    return;
  }

  if (!existing) {
    indexes.all.set(id, { type, path });
  }

  if (!indexes[type]) {
    indexes[type] = new Map();
  }
  if (!indexes[type].has(id)) {
    indexes[type].set(id, { type, path });
  }
}

function isSchemaFile(file) {
  return file?.classification === "schema" || /\.schema\.(json|ya?ml)$/i.test(file?.path ?? "");
}

function isTestFile(file) {
  const filePath = file?.path ?? "";
  return file?.classification === "test"
    || /(^|\/)(tests?|__tests__)\//i.test(filePath)
    || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(filePath);
}

function addFile(indexes, file, path, errors) {
  if (!file?.path) {
    return;
  }
  addId(indexes, file.path, "files", `${path}/path`, errors);
  if (isSchemaFile(file)) {
    addId(indexes, file.path, "schemas", `${path}/path`, errors, { allowDuplicate: true });
  }
  if (isTestFile(file)) {
    addId(indexes, file.path, "tests", `${path}/path`, errors, { allowDuplicate: true });
  }
}

function addUnknownLike(indexes, record, type, path, errors) {
  if (!record?.id) {
    return;
  }
  addId(indexes, record.id, type, `${path}/id`, errors, { allowDuplicate: true });
  addId(indexes, record.id, "gaps", `${path}/id`, errors, { allowDuplicate: true });
}

function requireRef(indexes, type, id, path, errors, { allowAny = false } = {}) {
  if (!id) {
    return;
  }

  if (allowAny && indexes.all.has(id)) {
    return;
  }

  if (!indexes[type]?.has(id)) {
    addError(errors, "dangling_ref", path, `Reference "${id}" must point to an existing ${type} id.`);
  }
}

function requireRefs(indexes, type, refs = [], path, errors, options = {}) {
  asList(refs).forEach((id, index) => requireRef(indexes, type, id, `${path}/${index}`, errors, options));
}

function shouldValidateLooseRef(ref) {
  return typeof ref === "string" && ref.length > 0 && /^(AC|APPROVAL|ARCH|BOUNDARY|COMP|DATA|DEP|FILE|FLY|GAP|IF|IMPACT|PLAN|PO|REQ|SCENARIO|SCOPE|TEST|claim|cmp|data|debt|dep|drift|evidence|ev|failure|gap|impact|learn|service|src|stop|stress|telemetry|trace)\b[.-]/.test(ref);
}

function requireLooseRef(indexes, id, path, errors) {
  if (!shouldValidateLooseRef(id)) {
    return;
  }

  if (!indexes.all.has(id)) {
    addError(errors, "dangling_ref", path, `Reference "${id}" is not present in the SEAL trace index.`);
  }
}

function validateSourceRefsRecursively(value, indexes, errors, path = "") {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSourceRefsRecursively(item, indexes, errors, `${path}/${index}`));
    return;
  }

  if (Array.isArray(value.source_refs)) {
    requireRefs(indexes, "sources", value.source_refs, `${path}/source_refs`, errors);
  }

  Object.entries(value).forEach(([key, child]) => {
    if (key === "source_refs") {
      return;
    }
    validateSourceRefsRecursively(child, indexes, errors, `${path}/${key}`);
  });
}

function buildIndexes(artifactSet) {
  const errors = [];
  const indexes = {
    all: new Map(),
    sources: new Map(),
    plans: new Map(),
    plan_items: new Map(),
    components: new Map(),
    files: new Map(),
    dependencies: new Map(),
    services: new Map(),
    interfaces: new Map(),
    data_stores: new Map(),
    tests: new Map(),
    schemas: new Map(),
    invariants: new Map(),
    unknowns: new Map(),
    gaps: new Map(),
    requirements: new Map(),
    risks: new Map(),
    assumptions: new Map(),
    trace_links: new Map(),
    launch_gates: new Map(),
    impacts: new Map(),
    claims: new Map(),
    evidence: new Map(),
    debts: new Map(),
    fly_records: new Map()
  };

  const sources = artifactSet.sources ?? {};
  asList(sources.sources).forEach((source, index) => {
    addId(indexes, source.id, "sources", `/sources/sources/${index}/id`, errors, { allowDuplicate: true });
  });

  const plan = artifactSet.plan ?? {};
  addId(indexes, plan.id, "plans", "/plan/id", errors);
  [
    ["scope", plan.scope],
    ["non_goals", plan.non_goals],
    ["trade_priorities", plan.trade_priorities],
    ["scenarios", plan.scenarios],
    ["acceptance_criteria", plan.acceptance_criteria],
    ["proof_obligations", plan.proof_obligations],
    ["approval_needs", plan.approval_needs],
    ["architecture_intent/components", plan.architecture_intent?.components],
    ["architecture_intent/interfaces", plan.architecture_intent?.interfaces],
    ["architecture_intent/data_stores", plan.architecture_intent?.data_stores],
    ["architecture_intent/boundaries", plan.architecture_intent?.boundaries]
  ].forEach(([collectionPath, records]) => {
    asList(records).forEach((record, index) => {
      addId(indexes, record.id, "plan_items", `/plan/${collectionPath}/${index}/id`, errors, { allowDuplicate: true });
    });
  });

  const map = artifactSet.map ?? {};
  asList(map.sources).forEach((source, index) => {
    addId(indexes, source.id, "sources", `/map/sources/${index}/id`, errors, { allowDuplicate: true });
  });
  asList(map.components).forEach((component, index) => addId(indexes, component.id, "components", `/map/components/${index}/id`, errors));
  asList(map.files).forEach((file, index) => addFile(indexes, file, `/map/files/${index}`, errors));
  asList(map.dependencies).forEach((dependency, index) => addId(indexes, dependency.id ?? dependency.name, "dependencies", `/map/dependencies/${index}/id`, errors));
  asList(map.services?.discovered ?? map.services).forEach((service, index) => addId(indexes, service.id ?? service.name, "services", `/map/services/discovered/${index}/id`, errors));
  asList(map.interfaces).forEach((interfaceRecord, index) => addId(indexes, interfaceRecord.id ?? interfaceRecord.name, "interfaces", `/map/interfaces/${index}/id`, errors));
  asList(map.data_stores).forEach((store, index) => addId(indexes, store.id ?? store.name, "data_stores", `/map/data_stores/${index}/id`, errors));
  asList(map.tests).forEach((test, index) => addId(indexes, test.id ?? test.path, "tests", `/map/tests/${index}/id`, errors));
  asList(map.unknowns).forEach((unknown, index) => addUnknownLike(indexes, unknown, "unknowns", `/map/unknowns/${index}`, errors));
  asList(map.gaps).forEach((gap, index) => addUnknownLike(indexes, gap, "unknowns", `/map/gaps/${index}`, errors));
  asList(map.requirements).forEach((requirement, index) => addId(indexes, requirement.id, "requirements", `/map/requirements/${index}/id`, errors));
  asList(map.risks).forEach((risk, index) => addId(indexes, risk.id, "risks", `/map/risks/${index}/id`, errors));
  asList(map.assumptions).forEach((assumption, index) => addId(indexes, assumption.id, "assumptions", `/map/assumptions/${index}/id`, errors));
  asList(map.trace_links).forEach((traceLink, index) => addId(indexes, traceLink.id, "trace_links", `/map/trace_links/${index}/id`, errors));
  asList(map.launch_gates).forEach((gate, index) => addId(indexes, gate.id, "launch_gates", `/map/launch_gates/${index}/id`, errors));
  asList(map.drift).forEach((drift, index) => addId(indexes, drift.id, "unknowns", `/map/drift/${index}/id`, errors, { allowDuplicate: true }));

  const impacts = Array.isArray(artifactSet.impacts) ? artifactSet.impacts : [artifactSet.impact].filter(Boolean);
  impacts.forEach((impact, index) => {
    addId(indexes, impact.id, "impacts", `/impacts/${index}/id`, errors);
    Object.entries(impact.affected ?? {}).forEach(([section, records]) => {
      asList(records).forEach((record, recordIndex) => {
        addId(indexes, record.id, "plan_items", `/impacts/${index}/affected/${section}/${recordIndex}/id`, errors, { allowDuplicate: true });
      });
    });
    asList(impact.proof_required).forEach((record, recordIndex) => {
      addId(indexes, record.id, "plan_items", `/impacts/${index}/proof_required/${recordIndex}/id`, errors, { allowDuplicate: true });
    });
    asList(impact.approval_needed).forEach((record, recordIndex) => {
      addId(indexes, record.id, "plan_items", `/impacts/${index}/approval_needed/${recordIndex}/id`, errors, { allowDuplicate: true });
    });
    asList(impact.blocking_unknowns).forEach((gap, gapIndex) => addUnknownLike(indexes, gap, "unknowns", `/impacts/${index}/blocking_unknowns/${gapIndex}`, errors));
    asList(impact.gaps).forEach((gap, gapIndex) => addUnknownLike(indexes, gap, "unknowns", `/impacts/${index}/gaps/${gapIndex}`, errors));
  });

  const proof = artifactSet.proof ?? {};
  asList(proof.claims).forEach((claim, index) => addId(indexes, claim.id, "claims", `/proof/claims/${index}/id`, errors));
  asList(proof.evidence).forEach((evidence, index) => addId(indexes, evidence.id, "evidence", `/proof/evidence/${index}/id`, errors, { allowDuplicate: true }));
  asList(proof.gaps).forEach((gap, index) => addUnknownLike(indexes, gap, "unknowns", `/proof/gaps/${index}`, errors));

  const evidenceIndex = artifactSet.evidenceIndex ?? {};
  asList(evidenceIndex.evidence).forEach((evidence, index) => addId(indexes, evidence.id, "evidence", `/evidenceIndex/evidence/${index}/id`, errors, { allowDuplicate: true }));

  const trace = artifactSet.trace ?? {};
  asList(trace.relations).forEach((relation, index) => addId(indexes, relation.id, "trace_links", `/trace/relations/${index}/id`, errors));

  const debt = artifactSet.debt ?? {};
  asList(debt.records).forEach((record, index) => addId(indexes, record.id, "debts", `/debt/records/${index}/id`, errors));

  const flyRecords = Array.isArray(artifactSet.fly) ? artifactSet.fly : [artifactSet.fly].filter(Boolean);
  flyRecords.forEach((fly, index) => addId(indexes, fly.id, "fly_records", `/fly/${index}/id`, errors));

  return { indexes, errors };
}

function validatePlanReferences(plan, indexes, errors) {
  requireRefs(indexes, "trace_links", plan.trace_refs, "/plan/trace_refs", errors);
}

function validateMapReferences(map, indexes, errors) {
  asList(map.files).forEach((file, index) => {
    if (file.owner_component_id) {
      requireRef(indexes, "components", file.owner_component_id, `/map/files/${index}/owner_component_id`, errors);
    }
    if (file.component_id) {
      requireRef(indexes, "components", file.component_id, `/map/files/${index}/component_id`, errors);
    }
  });

  asList(map.components).forEach((component, index) => {
    requireRefs(indexes, "files", component.files, `/map/components/${index}/files`, errors);
    requireRefs(indexes, "interfaces", component.interfaces, `/map/components/${index}/interfaces`, errors);
    asList(component.dependencies).forEach((dependencyId, dependencyIndex) => {
      if (typeof dependencyId === "string" && dependencyId.startsWith("dep.")) {
        requireRef(indexes, "dependencies", dependencyId, `/map/components/${index}/dependencies/${dependencyIndex}`, errors);
      }
    });
    asList(component.tests).forEach((testId, testIndex) => {
      if (indexes.tests.has(testId)) {
        return;
      }
      requireRef(indexes, "files", testId, `/map/components/${index}/tests/${testIndex}`, errors);
    });
    requireRefs(indexes, "gaps", component.proof_gaps, `/map/components/${index}/proof_gaps`, errors);
    requireRefs(indexes, "gaps", component.unknowns, `/map/components/${index}/unknowns`, errors);
  });

  asList(map.services?.discovered ?? map.services).forEach((service, index) => {
    requireRefs(indexes, "components", [service.owner_component, service.owner_component_id].filter(Boolean), `/map/services/discovered/${index}/owner_component`, errors);
    requireRefs(indexes, "interfaces", service.interfaces, `/map/services/discovered/${index}/interfaces`, errors);
    requireRefs(indexes, "gaps", service.unknowns, `/map/services/discovered/${index}/unknowns`, errors);
  });

  asList(map.data_stores).forEach((store, index) => {
    requireRefs(indexes, "components", [store.owner, store.owner_component, store.owner_component_id].filter(Boolean), `/map/data_stores/${index}/owner`, errors);
    requireRefs(indexes, "gaps", store.proof_gaps, `/map/data_stores/${index}/proof_gaps`, errors);
  });
}

function validateImpactReferences(impact, impactIndex, indexes, errors) {
  Object.entries(impact.affected ?? {}).forEach(([section, records]) => {
    const targetType = typedAffectedTargets[section];
    const expectedKind = typedAffectedKinds[section];
    asList(records).forEach((record, recordIndex) => {
      if (!targetType) {
        return;
      }
      if (record.kind && expectedKind && record.kind !== expectedKind) {
        addError(
          errors,
          "invalid_link_type",
          `/impacts/${impactIndex}/affected/${section}/${recordIndex}/kind`,
          `Affected ${section} records must use kind "${expectedKind}", not "${record.kind}".`
        );
      }
      if (!record.ref) {
        return;
      }
      requireRef(indexes, targetType, record.ref, `/impacts/${impactIndex}/affected/${section}/${recordIndex}/ref`, errors);
    });
  });

  for (const section of ["new_runtime_costs", "removed_runtime_costs", "unknown_costs"]) {
    asList(impact.dependency_service_cost_impact?.[section]).forEach((record, index) => {
      requireLooseRef(indexes, record.ref, `/impacts/${impactIndex}/dependency_service_cost_impact/${section}/${index}/ref`, errors);
    });
  }

  asList(impact.proof_required).forEach((record, index) => {
    requireLooseRef(indexes, record.claim_id, `/impacts/${impactIndex}/proof_required/${index}/claim_id`, errors);
    requireLooseRef(indexes, record.gap_id, `/impacts/${impactIndex}/proof_required/${index}/gap_id`, errors);
  });

  asList(impact.approval_needed).forEach((record, index) => {
    requireLooseRef(indexes, record.subject, `/impacts/${impactIndex}/approval_needed/${index}/subject`, errors);
    requireLooseRef(indexes, record.gap_id, `/impacts/${impactIndex}/approval_needed/${index}/gap_id`, errors);
  });
}

function validateProofReferences(proof, evidenceIndex, indexes, errors) {
  asList(proof.claims).forEach((claim, claimIndex) => {
    requireRefs(indexes, "evidence", claim.evidence_refs, `/proof/claims/${claimIndex}/evidence_refs`, errors);
    requireRefs(indexes, "gaps", claim.gap_refs, `/proof/claims/${claimIndex}/gap_refs`, errors);
    requireRefs(indexes, "evidence", claim.counterevidence_refs, `/proof/claims/${claimIndex}/counterevidence_refs`, errors);
  });

  asList(proof.evidence).forEach((evidence, evidenceIndex) => {
    requireRefs(indexes, "claims", evidence.supports, `/proof/evidence/${evidenceIndex}/supports`, errors);
    requireRefs(indexes, "claims", evidence.refutes, `/proof/evidence/${evidenceIndex}/refutes`, errors);
  });

  asList(proof.gaps).forEach((gap, gapIndex) => {
    asList(gap.blocks).forEach((id, blockIndex) => requireLooseRef(indexes, id, `/proof/gaps/${gapIndex}/blocks/${blockIndex}`, errors));
  });

  asList(evidenceIndex.evidence).forEach((evidence, evidenceIndex) => {
    requireRefs(indexes, "claims", evidence.claim_ids, `/evidenceIndex/evidence/${evidenceIndex}/claim_ids`, errors);
  });
}

function validateTraceReferences(trace, indexes, errors) {
  asList(trace.relations).forEach((relation, index) => {
    if (Array.isArray(trace.relation_types) && !trace.relation_types.includes(relation.type)) {
      addError(errors, "invalid_trace_relation_type", `/trace/relations/${index}/type`, `Trace relation "${relation.type}" is not declared in relation_types.`);
    }
    requireLooseRef(indexes, relation.from, `/trace/relations/${index}/from`, errors);
    requireLooseRef(indexes, relation.to, `/trace/relations/${index}/to`, errors);
  });
}

function validateDebtReferences(debt, indexes, errors) {
  requireRefs(indexes, "sources", debt.source_refs, "/debt/source_refs", errors);
  asList(debt.records).forEach((record, index) => {
    asList(record.blocks).forEach((id, blockIndex) => requireLooseRef(indexes, id, `/debt/records/${index}/blocks/${blockIndex}`, errors));
    requireRefs(indexes, "files", record.file_refs, `/debt/records/${index}/file_refs`, errors);
    requireRefs(indexes, "components", record.component_refs, `/debt/records/${index}/component_refs`, errors);
    requireRefs(indexes, "gaps", record.gap_refs, `/debt/records/${index}/gap_refs`, errors);
    asList(record.test_refs).forEach((id, testIndex) => {
      if (indexes.tests.has(id)) {
        return;
      }
      requireRef(indexes, "files", id, `/debt/records/${index}/test_refs/${testIndex}`, errors);
    });
  });
}

function validateFlyReferences(fly, flyIndex, indexes, errors) {
  const learning = fly.learning ?? {};
  for (const section of ["plan_updates_required", "map_updates_required", "proof_updates_required", "new_unknowns", "retired_assumptions", "new_debt", "next_fly_cycle"]) {
    asList(learning[section]).forEach((record, index) => {
      requireLooseRef(indexes, record.ref, `/fly/${flyIndex}/learning/${section}/${index}/ref`, errors);
    });
  }
}

export function validateArtifactReferences(artifactSet) {
  const { indexes, errors } = buildIndexes(artifactSet);

  validateSourceRefsRecursively(artifactSet, indexes, errors);
  validatePlanReferences(artifactSet.plan ?? {}, indexes, errors);
  validateMapReferences(artifactSet.map ?? {}, indexes, errors);

  const impacts = Array.isArray(artifactSet.impacts) ? artifactSet.impacts : [artifactSet.impact].filter(Boolean);
  impacts.forEach((impact, impactIndex) => validateImpactReferences(impact, impactIndex, indexes, errors));

  validateProofReferences(artifactSet.proof ?? {}, artifactSet.evidenceIndex ?? {}, indexes, errors);
  validateTraceReferences(artifactSet.trace ?? {}, indexes, errors);
  validateDebtReferences(artifactSet.debt ?? {}, indexes, errors);

  const flyRecords = Array.isArray(artifactSet.fly) ? artifactSet.fly : [artifactSet.fly].filter(Boolean);
  flyRecords.forEach((fly, flyIndex) => validateFlyReferences(fly, flyIndex, indexes, errors));

  return {
    valid: errors.length === 0,
    errors
  };
}
