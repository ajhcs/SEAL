const weakAuthorityStates = new Set(["inferred", "unknown"]);
const weakSourceKinds = new Set(["inference", "unknown"]);

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addError(errors, code, path, message) {
  errors.push({ code, path, message });
}

function sourceAuthorityIndex(artifactSet = {}) {
  const sources = new Map();

  for (const source of [
    ...asList(artifactSet.sources?.sources),
    ...asList(artifactSet.map?.sources)
  ]) {
    if (!source?.id) {
      continue;
    }

    sources.set(source.id, {
      authority_state: source.authority_state ?? source.kind,
      kind: source.kind
    });
  }

  return sources;
}

function sourceIsWeak(source) {
  if (!source) {
    return true;
  }

  return weakAuthorityStates.has(source.authority_state) || weakSourceKinds.has(source.kind);
}

function sourceRefsAreOnlyWeak(sourceRefs = [], sources) {
  if (sourceRefs.length === 0) {
    return false;
  }

  return sourceRefs.every((sourceId) => sourceIsWeak(sources.get(sourceId)));
}

function validateRecordAuthority(record, path, sources, errors) {
  if (!isObject(record) || record.approval_state !== "approved") {
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

function validateTreeAuthority(value, path, sources, errors) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateTreeAuthority(entry, `${path}/${index}`, sources, errors));
    return;
  }

  if (!isObject(value)) {
    return;
  }

  validateRecordAuthority(value, path, sources, errors);

  for (const [key, child] of Object.entries(value)) {
    if (["source_refs", "trace_refs", "evidence_refs", "gap_refs", "counterevidence_refs"].includes(key)) {
      continue;
    }
    validateTreeAuthority(child, `${path}/${key}`, sources, errors);
  }
}

export function validateAuthority(artifactSet) {
  const errors = [];
  const sources = sourceAuthorityIndex(artifactSet);

  for (const [artifactName, artifact] of Object.entries(artifactSet ?? {})) {
    validateTreeAuthority(artifact, `/${artifactName}`, sources, errors);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
