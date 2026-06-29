const weakAuthorityStates = new Set(["inferred", "unknown"]);

function addError(errors, code, path, message) {
  errors.push({ code, path, message });
}

function sourceAuthorityIndex(map = {}) {
  return new Map((map.sources ?? []).map((source) => [source.id, source.authority_state]));
}

function sourceRefsAreOnlyWeak(sourceRefs = [], sources) {
  if (sourceRefs.length === 0) {
    return false;
  }

  return sourceRefs.every((sourceId) => weakAuthorityStates.has(sources.get(sourceId)));
}

function validateRecordAuthority(record, path, sources, errors) {
  if (!record || record.approval_state !== "approved") {
    return;
  }

  if (weakAuthorityStates.has(record.authority_state)) {
    addError(
      errors,
      "approved_weak_authority",
      `${path}/authority_state`,
      `Approved baseline record at ${path} cannot use ${record.authority_state} authority.`
    );
  }

  if (sourceRefsAreOnlyWeak(record.source_refs, sources)) {
    addError(
      errors,
      "approved_weak_sources",
      `${path}/source_refs`,
      `Approved baseline record at ${path} is backed only by inferred or unknown source authority.`
    );
  }
}

export function validateAuthority(artifactSet) {
  const errors = [];
  const map = artifactSet.map ?? {};
  const sources = sourceAuthorityIndex(map);

  map.sources?.forEach((source, index) => {
    validateRecordAuthority(source, `/map/sources/${index}`, sources, errors);
  });
  map.components?.forEach((component, index) => {
    validateRecordAuthority(component, `/map/components/${index}`, sources, errors);
  });
  map.files?.forEach((file, index) => {
    validateRecordAuthority(file, `/map/files/${index}`, sources, errors);
  });
  map.gaps?.forEach((gap, index) => {
    validateRecordAuthority(gap, `/map/gaps/${index}`, sources, errors);
  });
  map.requirements?.forEach((requirement, index) => {
    validateRecordAuthority(requirement, `/map/requirements/${index}`, sources, errors);
  });
  map.risks?.forEach((risk, index) => {
    validateRecordAuthority(risk, `/map/risks/${index}`, sources, errors);
  });
  map.assumptions?.forEach((assumption, index) => {
    validateRecordAuthority(assumption, `/map/assumptions/${index}`, sources, errors);
  });
  map.trace_links?.forEach((traceLink, index) => {
    validateRecordAuthority(traceLink, `/map/trace_links/${index}`, sources, errors);
  });
  map.launch_gates?.forEach((gate, index) => {
    validateRecordAuthority(gate, `/map/launch_gates/${index}`, sources, errors);
  });

  const impacts = Array.isArray(artifactSet.impacts)
    ? artifactSet.impacts
    : [artifactSet.impact].filter(Boolean);
  impacts.forEach((impact, impactIndex) => {
    validateRecordAuthority(impact.change, `/impacts/${impactIndex}/change`, sources, errors);
    impact.affected?.forEach((affected, affectedIndex) => {
      validateRecordAuthority(affected, `/impacts/${impactIndex}/affected/${affectedIndex}`, sources, errors);
    });
    impact.proof_needed?.forEach((proofNeed, proofIndex) => {
      validateRecordAuthority(proofNeed, `/impacts/${impactIndex}/proof_needed/${proofIndex}`, sources, errors);
    });
    impact.gaps?.forEach((gap, gapIndex) => {
      validateRecordAuthority(gap, `/impacts/${impactIndex}/gaps/${gapIndex}`, sources, errors);
    });
  });

  const proof = artifactSet.proof ?? {};
  proof.claims?.forEach((claim, index) => {
    validateRecordAuthority(claim, `/proof/claims/${index}`, sources, errors);
  });
  proof.gaps?.forEach((gap, index) => {
    validateRecordAuthority(gap, `/proof/gaps/${index}`, sources, errors);
  });

  const evidenceIndex = artifactSet.evidenceIndex ?? {};
  evidenceIndex.evidence?.forEach((evidence, index) => {
    validateRecordAuthority(evidence, `/evidenceIndex/evidence/${index}`, sources, errors);
  });

  const debt = artifactSet.debt ?? {};
  debt.records?.forEach((record, index) => {
    validateRecordAuthority(record, `/debt/records/${index}`, sources, errors);
  });

  return {
    valid: errors.length === 0,
    errors
  };
}
