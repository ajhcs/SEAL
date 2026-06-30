import { CONTRACT_SCHEMA_VERSION } from "../contracts/constants.mjs";

function stableSegment(value) {
  return String(value)
    .replaceAll("\\", "/")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "unknown";
}

function firstSourceRef(record, fallback) {
  return record?.source_refs?.[0] ?? fallback;
}

function sourceRefsForRecords(records, fallback) {
  return [...new Set(records.flatMap((record) => record.source_refs ?? []))].filter(Boolean).sort()
    .concat(records.length === 0 ? [fallback] : [])
    .filter(Boolean);
}

function baseRecord({
  id,
  type,
  subject,
  summary,
  reason,
  sourceRefs,
  severity = "warning",
  confidence = 0.6,
  blocks = [],
  closureMethod,
  createdBy = "seal.map",
  nextAction,
  plainLanguage
}) {
  const closure = closureMethod ?? nextAction ?? "Provide authoritative evidence or accept the debt explicitly.";
  return {
    id,
    type,
    subject: subject ?? summary ?? id,
    severity,
    summary,
    reason,
    source_refs: sourceRefs?.length ? sourceRefs : ["source.unknown"],
    blocks,
    closure_method: closure,
    authority_state: "inferred",
    approval_state: "pending",
    confidence,
    status: "open",
    created_by: createdBy,
    next_action: nextAction ?? closure,
    plain_language: plainLanguage
  };
}

function filesForGap(map, gapId) {
  return (map.files ?? []).filter((file) => file.gap_refs?.includes(gapId));
}

function createGapDebtRecord(map, gap, fallbackSource) {
  const sourceRefs = gap.source_refs?.length ? gap.source_refs : [fallbackSource];
  const gapFiles = filesForGap(map, gap.id);

  if (gap.id.startsWith("gap.unknown-file.")) {
    const fileRefs = gapFiles.map((file) => file.path);
    return {
      ...baseRecord({
        id: `debt.${stableSegment(gap.id)}`,
        type: "unknown_file",
        subject: fileRefs[0] ?? gap.id,
        summary: gap.summary,
        reason: gap.reason,
        sourceRefs,
        confidence: gap.confidence ?? 0.4,
        nextAction: "Classify or intentionally exclude the file with an explicit source-backed reason.",
        plainLanguage: "SEAL saw a file it cannot safely classify yet, so the file remains visible instead of being hidden."
      }),
      gap_refs: [gap.id],
      file_refs: fileRefs
    };
  }

  if (gap.id.startsWith("gap.file-proof.")) {
    const fileRefs = gapFiles.map((file) => file.path);
    return {
      ...baseRecord({
        id: `debt.${stableSegment(gap.id)}`,
        type: "missing_evidence",
        subject: fileRefs[0] ?? gap.id,
        summary: gap.summary,
        reason: gap.reason,
        sourceRefs,
        blocks: ["srl.4"],
        confidence: gap.confidence ?? 0.55,
        nextAction: "Add or identify a test, review artifact, execution trace, or explicit proof gap for this file.",
        plainLanguage: "The file is mapped, but SEAL has not observed proof that it is covered by validation evidence."
      }),
      gap_refs: [gap.id],
      file_refs: fileRefs
    };
  }

  if (gap.id === "gap.repo-component-boundaries") {
    return {
      ...baseRecord({
        id: "debt.repo-component-boundaries",
        type: "missing_owner",
        subject: "component boundaries",
        summary: gap.summary,
        reason: gap.reason,
        sourceRefs,
        confidence: gap.confidence ?? 0.55,
        nextAction: "Review, split, merge, or approve inferred component boundaries.",
        plainLanguage: "SEAL inferred component boundaries from paths, but those boundaries still need review."
      }),
      gap_refs: [gap.id],
      component_refs: (map.components ?? []).map((component) => component.id)
    };
  }

  if (gap.id === "gap.repo-business-requirements") {
    return {
      ...baseRecord({
        id: "debt.repo-business-requirements",
        type: "missing_requirement",
        subject: "business requirements",
        summary: gap.summary,
        reason: gap.reason,
        sourceRefs,
        blocks: ["srl.4"],
        confidence: gap.confidence ?? 0.45,
        nextAction: "Attach requirement, product, launch, or stakeholder authority before treating the map as complete.",
        plainLanguage: "The repository was observed, but the business requirements behind it have not been sourced yet."
      }),
      gap_refs: [gap.id]
    };
  }

  if (gap.id === "gap.repo-test-proof-links") {
    return {
      ...baseRecord({
        id: "debt.repo-test-proof-links",
        type: "missing_evidence",
        subject: "test proof links",
        summary: gap.summary,
        reason: gap.reason,
        sourceRefs,
        blocks: ["srl.4"],
        confidence: gap.confidence ?? 0.5,
        nextAction: "Run tests or attach evidence that links observed files to validation outcomes.",
        plainLanguage: "SEAL can see files and tests, but it has not seen execution evidence tying them to proof yet."
      }),
      gap_refs: [gap.id]
    };
  }

  if (gap.id.includes("service")) {
    return {
      ...baseRecord({
        id: `debt.${stableSegment(gap.id)}`,
        type: "hidden_service",
        subject: "service discovery",
        summary: gap.summary,
        reason: gap.reason,
        sourceRefs,
        confidence: gap.confidence ?? 0.5,
        nextAction: "Confirm whether runtime services, bindings, API clients, or environment-backed providers exist.",
        plainLanguage: "SEAL has not proved the service surface is fully known yet."
      }),
      gap_refs: [gap.id]
    };
  }

  if (gap.id.includes("cost")) {
    return {
      ...baseRecord({
        id: `debt.${stableSegment(gap.id)}`,
        type: "cost_unknown",
        subject: "runtime cost",
        summary: gap.summary,
        reason: gap.reason,
        sourceRefs,
        confidence: gap.confidence ?? 0.5,
        nextAction: "Attach pricing, usage, quota, or cost-bound evidence for the runtime dependency.",
        plainLanguage: "SEAL has not proved the cost impact is known yet."
      }),
      gap_refs: [gap.id]
    };
  }

  return null;
}

function createUnlinkedTestRecords(map, fallbackSource) {
  const linkedTests = new Set((map.files ?? []).flatMap((file) => file.tests ?? []));
  return (map.files ?? [])
    .filter((file) => file.classification === "test")
    .filter((file) => !linkedTests.has(file.path))
    .map((file) => ({
      ...baseRecord({
        id: `debt.unlinked-test.${stableSegment(file.path)}`,
        type: "missing_test",
        subject: file.path,
        severity: "info",
        summary: `Test file ${file.path} is not linked to a product file.`,
        reason: "Static inspection found a test-classified file, but no mapped product file currently references it as validation evidence.",
        sourceRefs: file.source_refs?.length ? file.source_refs : [fallbackSource],
        confidence: 0.65,
        nextAction: "Link this test to the product file or component it validates, or record why it is intentionally standalone.",
        plainLanguage: "The test exists, but SEAL cannot yet tell what production behavior it proves."
      }),
      file_refs: [file.path],
      test_refs: [file.path]
    }));
}

function createRiskyDependencyRecords(map, fallbackSource) {
  return (map.files ?? []).flatMap((file) => (file.dependencies ?? [])
    .filter((dependency) => dependency.kind === "unresolved_file")
    .map((dependency) => ({
      ...baseRecord({
        id: `debt.risky-dependency.${stableSegment(file.path)}.${stableSegment(dependency.specifier)}`,
        type: "risky_dependency",
        subject: `${file.path} -> ${dependency.specifier}`,
        summary: `${file.path} imports unresolved dependency ${dependency.specifier}.`,
        reason: "Static dependency extraction could not resolve this local import to a mapped file.",
        sourceRefs: file.source_refs?.length ? file.source_refs : [fallbackSource],
        confidence: 0.55,
        nextAction: "Resolve the import target, update the map, or document why the dependency is provided out of band.",
        plainLanguage: "A source file points at something SEAL cannot find in the repository inventory."
      }),
      file_refs: [file.path],
      dependency_refs: [dependency.specifier]
    })));
}

function createOrphanComponentRecords(map, fallbackSource) {
  return (map.components ?? [])
    .filter((component) => !["repo", "cmp.repo"].includes(component.id))
    .filter((component) => (component.files ?? component.source_files ?? []).length === 0)
    .map((component) => ({
      ...baseRecord({
        id: `debt.orphan-component.${stableSegment(component.id)}`,
        type: "orphan_component",
        subject: component.id,
        summary: `Component ${component.id} has no mapped source files.`,
        reason: "The component exists in the map without owning any observed files.",
        sourceRefs: component.source_refs?.length ? component.source_refs : [fallbackSource],
        confidence: 0.6,
        nextAction: "Attach source files, merge the component, or remove it from the map.",
        plainLanguage: "SEAL has a component bucket that does not currently explain any repository files."
      }),
      component_refs: [component.id]
    }));
}

function uniqueMapGaps(map) {
  const byId = new Map();
  for (const gap of [...(map.gaps ?? []), ...(map.unknowns ?? [])]) {
    if (gap?.id && !byId.has(gap.id)) {
      byId.set(gap.id, gap);
    }
  }
  return [...byId.values()];
}

export function createDebtRegisterFromMap(map) {
  const fallbackSource = map.sources?.[0]?.id ?? "source.unknown";
  const records = [
    ...uniqueMapGaps(map).map((gap) => createGapDebtRecord(map, gap, firstSourceRef(gap, fallbackSource))).filter(Boolean),
    ...createUnlinkedTestRecords(map, fallbackSource),
    ...createRiskyDependencyRecords(map, fallbackSource),
    ...createOrphanComponentRecords(map, fallbackSource)
  ].sort((left, right) => left.id.localeCompare(right.id));

  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    source_refs: sourceRefsForRecords(records, fallbackSource),
    records
  };
}
