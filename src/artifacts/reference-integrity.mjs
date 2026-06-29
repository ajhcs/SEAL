const affectedTargetIndexes = Object.freeze({
  component: "components",
  file: "files",
  test: "files",
  schema: "files",
  requirement: "requirements",
  gate: "launch_gates",
  risk: "risks",
  proof: "claims"
});

function addId(indexes, id, type, path, errors) {
  if (!id) {
    return;
  }

  if (indexes.all.has(id)) {
    errors.push({
      code: "duplicate_id",
      path,
      message: `Duplicate SEAL id "${id}" already defined at ${indexes.all.get(id).path}.`
    });
    return;
  }

  indexes.all.set(id, { type, path });
  if (!indexes[type]) {
    indexes[type] = new Map();
  }
  indexes[type].set(id, { type, path });
}

function requireRef(indexes, type, id, path, errors) {
  if (!id) {
    return;
  }

  if (!indexes[type]?.has(id)) {
    errors.push({
      code: "dangling_ref",
      path,
      message: `Reference "${id}" must point to an existing ${type} id.`
    });
  }
}

function requireRefs(indexes, type, refs = [], path, errors) {
  refs.forEach((id, index) => requireRef(indexes, type, id, `${path}/${index}`, errors));
}

function requireAffectedTarget(indexes, affectedKind, affectedId, kindPath, idPath, errors) {
  if (affectedKind === "unknown") {
    return;
  }
  const targetType = affectedTargetIndexes[affectedKind];
  if (!targetType) {
    errors.push({
      code: "invalid_link_type",
      path: kindPath,
      message: `Affected kind "${affectedKind}" has no P0 reference target. Use component, file, or record an explicit gap.`
    });
    return;
  }
  requireRef(indexes, targetType, affectedId, idPath, errors);
}

function buildIndexes(artifactSet) {
  const errors = [];
  const indexes = {
    all: new Map(),
    sources: new Map(),
    components: new Map(),
    files: new Map(),
    gaps: new Map(),
    requirements: new Map(),
    risks: new Map(),
    assumptions: new Map(),
    trace_links: new Map(),
    launch_gates: new Map(),
    impacts: new Map(),
    claims: new Map(),
    evidence: new Map(),
    debts: new Map()
  };

  const map = artifactSet.map ?? {};
  map.sources?.forEach((source, index) => addId(indexes, source.id, "sources", `/map/sources/${index}/id`, errors));
  map.components?.forEach((component, index) => addId(indexes, component.id, "components", `/map/components/${index}/id`, errors));
  map.files?.forEach((file, index) => addId(indexes, file.path, "files", `/map/files/${index}/path`, errors));
  map.gaps?.forEach((gap, index) => addId(indexes, gap.id, "gaps", `/map/gaps/${index}/id`, errors));
  map.requirements?.forEach((requirement, index) => addId(indexes, requirement.id, "requirements", `/map/requirements/${index}/id`, errors));
  map.risks?.forEach((risk, index) => addId(indexes, risk.id, "risks", `/map/risks/${index}/id`, errors));
  map.assumptions?.forEach((assumption, index) => addId(indexes, assumption.id, "assumptions", `/map/assumptions/${index}/id`, errors));
  map.trace_links?.forEach((traceLink, index) => addId(indexes, traceLink.id, "trace_links", `/map/trace_links/${index}/id`, errors));
  map.launch_gates?.forEach((gate, index) => addId(indexes, gate.id, "launch_gates", `/map/launch_gates/${index}/id`, errors));

  const impacts = Array.isArray(artifactSet.impacts)
    ? artifactSet.impacts
    : [artifactSet.impact].filter(Boolean);
  impacts.forEach((impact, index) => {
    addId(indexes, impact.id, "impacts", `/impacts/${index}/id`, errors);
    impact.gaps?.forEach((gap, gapIndex) => addId(indexes, gap.id, "gaps", `/impacts/${index}/gaps/${gapIndex}/id`, errors));
  });

  const proof = artifactSet.proof ?? {};
  proof.claims?.forEach((claim, index) => addId(indexes, claim.id, "claims", `/proof/claims/${index}/id`, errors));
  proof.gaps?.forEach((gap, index) => addId(indexes, gap.id, "gaps", `/proof/gaps/${index}/id`, errors));

  const evidenceIndex = artifactSet.evidenceIndex ?? {};
  evidenceIndex.evidence?.forEach((evidence, index) => addId(indexes, evidence.id, "evidence", `/evidenceIndex/evidence/${index}/id`, errors));

  const debt = artifactSet.debt ?? {};
  debt.records?.forEach((record, index) => addId(indexes, record.id, "debts", `/debt/records/${index}/id`, errors));

  return { indexes, errors };
}

export function validateArtifactReferences(artifactSet) {
  const { indexes, errors } = buildIndexes(artifactSet);
  const map = artifactSet.map ?? {};

  map.components?.forEach((component, index) => {
    requireRefs(indexes, "sources", component.source_refs, `/map/components/${index}/source_refs`, errors);
  });
  map.files?.forEach((file, index) => {
    if (file.component_id) {
      requireRef(indexes, "components", file.component_id, `/map/files/${index}/component_id`, errors);
    }
    requireRefs(indexes, "sources", file.source_refs, `/map/files/${index}/source_refs`, errors);
  });
  map.gaps?.forEach((gap, index) => {
    requireRefs(indexes, "sources", gap.source_refs, `/map/gaps/${index}/source_refs`, errors);
  });
  map.requirements?.forEach((requirement, index) => {
    requireRefs(indexes, "sources", requirement.source_refs, `/map/requirements/${index}/source_refs`, errors);
  });
  map.risks?.forEach((risk, index) => {
    requireRefs(indexes, "sources", risk.source_refs, `/map/risks/${index}/source_refs`, errors);
  });
  map.assumptions?.forEach((assumption, index) => {
    requireRefs(indexes, "sources", assumption.source_refs, `/map/assumptions/${index}/source_refs`, errors);
  });
  map.trace_links?.forEach((traceLink, index) => {
    requireRefs(indexes, "sources", traceLink.source_refs, `/map/trace_links/${index}/source_refs`, errors);
    requireRef(indexes, "all", traceLink.from_id, `/map/trace_links/${index}/from_id`, errors);
    requireRef(indexes, "all", traceLink.to_id, `/map/trace_links/${index}/to_id`, errors);
  });
  map.launch_gates?.forEach((gate, index) => {
    requireRefs(indexes, "sources", gate.source_refs, `/map/launch_gates/${index}/source_refs`, errors);
  });

  const impacts = Array.isArray(artifactSet.impacts)
    ? artifactSet.impacts
    : [artifactSet.impact].filter(Boolean);
  impacts.forEach((impact, impactIndex) => {
    requireRefs(indexes, "sources", impact.change?.source_refs, `/impacts/${impactIndex}/change/source_refs`, errors);
    impact.affected?.forEach((affected, affectedIndex) => {
      requireAffectedTarget(indexes, affected.kind, affected.id, `/impacts/${impactIndex}/affected/${affectedIndex}/kind`, `/impacts/${impactIndex}/affected/${affectedIndex}/id`, errors);
    });
    impact.proof_needed?.forEach((proofNeed, proofIndex) => {
      requireRef(indexes, "claims", proofNeed.claim_id, `/impacts/${impactIndex}/proof_needed/${proofIndex}/claim_id`, errors);
    });
    impact.proof_required?.forEach((proofRequired, proofIndex) => {
      requireRefs(indexes, "sources", proofRequired.source_refs, `/impacts/${impactIndex}/proof_required/${proofIndex}/source_refs`, errors);
      requireAffectedTarget(indexes, proofRequired.affected_kind, proofRequired.affected_id, `/impacts/${impactIndex}/proof_required/${proofIndex}/affected_kind`, `/impacts/${impactIndex}/proof_required/${proofIndex}/affected_id`, errors);
      requireRef(indexes, "claims", proofRequired.claim_id, `/impacts/${impactIndex}/proof_required/${proofIndex}/claim_id`, errors);
      requireRef(indexes, "gaps", proofRequired.gap_id, `/impacts/${impactIndex}/proof_required/${proofIndex}/gap_id`, errors);
    });
    impact.approval_needed?.forEach((approvalNeeded, approvalIndex) => {
      requireRefs(indexes, "sources", approvalNeeded.source_refs, `/impacts/${impactIndex}/approval_needed/${approvalIndex}/source_refs`, errors);
      requireAffectedTarget(indexes, approvalNeeded.affected_kind, approvalNeeded.affected_id, `/impacts/${impactIndex}/approval_needed/${approvalIndex}/affected_kind`, `/impacts/${impactIndex}/approval_needed/${approvalIndex}/affected_id`, errors);
      requireRef(indexes, "gaps", approvalNeeded.gap_id, `/impacts/${impactIndex}/approval_needed/${approvalIndex}/gap_id`, errors);
    });
    impact.gaps?.forEach((gap, gapIndex) => {
      requireRefs(indexes, "sources", gap.source_refs, `/impacts/${impactIndex}/gaps/${gapIndex}/source_refs`, errors);
    });
  });

  const proof = artifactSet.proof ?? {};
  proof.claims?.forEach((claim, claimIndex) => {
    requireRefs(indexes, "sources", claim.source_refs, `/proof/claims/${claimIndex}/source_refs`, errors);
    requireRefs(indexes, "evidence", claim.evidence_refs, `/proof/claims/${claimIndex}/evidence_refs`, errors);
    requireRefs(indexes, "gaps", claim.gap_refs, `/proof/claims/${claimIndex}/gap_refs`, errors);
  });
  proof.gaps?.forEach((gap, gapIndex) => {
    requireRefs(indexes, "sources", gap.source_refs, `/proof/gaps/${gapIndex}/source_refs`, errors);
  });

  const evidenceIndex = artifactSet.evidenceIndex ?? {};
  evidenceIndex.evidence?.forEach((evidence, evidenceIndex) => {
    requireRefs(indexes, "claims", evidence.claim_ids, `/evidenceIndex/evidence/${evidenceIndex}/claim_ids`, errors);
    requireRefs(indexes, "sources", evidence.source_refs, `/evidenceIndex/evidence/${evidenceIndex}/source_refs`, errors);
  });

  const debt = artifactSet.debt ?? {};
  requireRefs(indexes, "sources", debt.source_refs, "/debt/source_refs", errors);
  debt.records?.forEach((record, recordIndex) => {
    requireRefs(indexes, "sources", record.source_refs, `/debt/records/${recordIndex}/source_refs`, errors);
    requireRefs(indexes, "files", record.file_refs, `/debt/records/${recordIndex}/file_refs`, errors);
    requireRefs(indexes, "components", record.component_refs, `/debt/records/${recordIndex}/component_refs`, errors);
    requireRefs(indexes, "gaps", record.gap_refs, `/debt/records/${recordIndex}/gap_refs`, errors);
    requireRefs(indexes, "files", record.test_refs, `/debt/records/${recordIndex}/test_refs`, errors);
  });

  return {
    valid: errors.length === 0,
    errors
  };
}
