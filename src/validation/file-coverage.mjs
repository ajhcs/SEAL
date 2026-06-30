import { classifyFile } from "../inventory/classify.mjs";
import { listInventoryFiles } from "../inventory/walk.mjs";

const classificationExemptions = new Set(["generated", "vendored"]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function addToIndex(index, key, value) {
  if (!key) {
    return;
  }
  const existing = index.get(key) ?? [];
  existing.push(value);
  index.set(key, existing);
}

function ownerComponentId(fileRecord) {
  return fileRecord?.owner_component_id ?? fileRecord?.component_id;
}

function componentFileRefs(component) {
  return [
    ...asArray(component?.files),
    ...asArray(component?.source_files)
  ];
}

function normalizeComponent(component) {
  if (typeof component === "string") {
    return { id: component };
  }
  return component;
}

function collectComponents(map) {
  const componentsById = new Map();
  for (const component of [
    ...asArray(map.components),
    ...asArray(map.observed?.components),
    ...asArray(map.approved?.components)
  ].map(normalizeComponent).filter(Boolean)) {
    if (component.id && !componentsById.has(component.id)) {
      componentsById.set(component.id, component);
    }
  }
  return [...componentsById.values()];
}

function collectMapGapIds(map) {
  const ids = new Set();
  for (const collection of [map.gaps, map.unknowns, map.drift]) {
    for (const item of asArray(collection)) {
      if (item?.id) {
        ids.add(item.id);
      }
    }
  }
  for (const serviceGapId of asArray(map.services?.gaps)) {
    ids.add(serviceGapId);
  }
  return ids;
}

function classifySubjectRef(subject) {
  if (!subject) {
    return {};
  }
  if (typeof subject === "string") {
    return subject.includes("/") || subject.includes(".")
      ? { file: subject }
      : { component: subject };
  }

  if (subject.path || subject.file) {
    return { file: subject.path ?? subject.file };
  }
  if (subject.component || subject.component_id) {
    return { component: subject.component ?? subject.component_id };
  }
  if (subject.ref || subject.id) {
    const ref = subject.ref ?? subject.id;
    if (subject.kind === "file") {
      return { file: ref };
    }
    if (subject.kind === "component") {
      return { component: ref };
    }
    return classifySubjectRef(ref);
  }

  return {};
}

function buildDebtIndexes(debt) {
  const byFile = new Map();
  const byComponent = new Map();

  for (const record of debt?.records ?? []) {
    const subjectRef = classifySubjectRef(record.subject);
    addToIndex(byFile, subjectRef.file, record);
    addToIndex(byComponent, subjectRef.component, record);
    for (const fileRef of record.file_refs ?? []) {
      addToIndex(byFile, fileRef, record);
    }
    for (const componentRef of record.component_refs ?? []) {
      addToIndex(byComponent, componentRef, record);
    }
  }

  return { byFile, byComponent };
}

function hasVisibleGap(fileRecord, mapGapIds, debtRecords = []) {
  const directGapRefs = [
    ...asArray(fileRecord.gap_refs),
    ...asArray(fileRecord.unknowns)
  ];
  if (directGapRefs.some((gapId) => mapGapIds.has(gapId))) {
    return true;
  }

  return debtRecords.some((record) => (record.gap_refs ?? []).some((gapId) => mapGapIds.has(gapId)));
}

function componentHasCoverage(component, files, componentDebtRecords = []) {
  if (component.id === "repo") {
    return true;
  }
  if (componentFileRefs(component).length > 0) {
    return true;
  }
  if (files.some((file) => ownerComponentId(file) === component.id)) {
    return true;
  }
  return componentDebtRecords.length > 0;
}

function summarizeFile(summary, classification, coverageKind) {
  summary[coverageKind] += 1;
  if (classification === "generated") {
    summary.generated += 1;
  } else if (classification === "vendored") {
    summary.vendored += 1;
  } else if (classification === "unknown") {
    summary.unknown += 1;
  } else if (classificationExemptions.has(classification)) {
    summary.ignored += 1;
  }
}

export async function validateFileCoverage(rootPath, { map = {}, debt = {} } = {}) {
  const inventoryFiles = await listInventoryFiles(rootPath);
  const summary = {
    observed: inventoryFiles.length,
    mapped: 0,
    unmapped: 0,
    ignored: 0,
    generated: 0,
    vendored: 0,
    unknown: 0,
    component_mapped: 0,
    gap_backed: 0,
    stale: 0
  };
  const errors = [];

  if (inventoryFiles.length === 0) {
    return { valid: true, summary, errors };
  }

  const inventory = new Map(inventoryFiles.map((filePath) => [filePath, classifyFile(filePath)]));
  const mapFiles = map.files ?? [];
  const filesByPath = new Map(mapFiles.map((file) => [file.path, file]));
  const fileIndexByPath = new Map(mapFiles.map((file, index) => [file.path, index]));
  const components = collectComponents(map);
  const componentIds = new Set(components.map((component) => component.id));
  const mapGapIds = collectMapGapIds(map);
  const debtIndexes = buildDebtIndexes(debt);

  for (const [filePath, observedClassification] of inventory) {
    const fileRecord = filesByPath.get(filePath);
    if (!fileRecord) {
      summarizeFile(summary, observedClassification, "unmapped");
      errors.push({
        code: "unmapped_file",
        path: "/map/files",
        filePath,
        expected: "every non-ignored repository file represented in .seal/map.yaml",
        actual: "missing from map files",
        fix: "Regenerate the map or add this file with classification, source_refs, and either owner_component_id or an explicit visible gap.",
        message: `${filePath} is present in the repository inventory but absent from the SEAL map.`
      });
      continue;
    }

    summarizeFile(summary, observedClassification, "mapped");

    const fileIndex = fileIndexByPath.get(filePath);
    if (fileRecord.classification !== observedClassification) {
      errors.push({
        code: "classification_mismatch",
        path: `/map/files/${fileIndex}/classification`,
        filePath,
        expected: observedClassification,
        actual: fileRecord.classification,
        fix: "Update the map classification or document the exception as explicit authority-backed behavior.",
        message: `${filePath} is classified as ${fileRecord.classification}, but repository inspection classifies it as ${observedClassification}.`
      });
    }

    if (classificationExemptions.has(observedClassification)) {
      continue;
    }

    const fileDebtRecords = debtIndexes.byFile.get(filePath) ?? [];
    const componentId = ownerComponentId(fileRecord);
    const hasComponent = Boolean(componentId && componentIds.has(componentId));
    const hasGap = hasVisibleGap(fileRecord, mapGapIds, fileDebtRecords);
    if (hasComponent) {
      summary.component_mapped += 1;
    }
    if (hasGap) {
      summary.gap_backed += 1;
    }
    if (!hasComponent && !hasGap) {
      errors.push({
        code: "uncovered_file",
        path: `/map/files/${fileIndex}`,
        filePath,
        expected: "component ownership or explicit visible gap for every non-generated, non-vendored file",
        actual: "no owner_component_id and no visible gap/debt record",
        fix: "Attach the file to a component, or add a map gap and debt record that makes the unknown ownership visible.",
        message: `${filePath} is visible in the map but has no component ownership or explicit gap.`
      });
    }
  }

  for (const [index, fileRecord] of mapFiles.entries()) {
    if (!inventory.has(fileRecord.path)) {
      summary.stale += 1;
      errors.push({
        code: "stale_file_ref",
        path: `/map/files/${index}/path`,
        filePath: fileRecord.path,
        expected: "map file path observed in current repository inventory",
        actual: "not present in repository inventory",
        fix: "Remove the stale map file entry, restore the file, or record the removal in impact analysis before relying on coverage.",
        message: `${fileRecord.path} is mapped but is not present in the current repository inventory.`
      });
    }
  }

  const coveredComponents = components;
  for (const [index, component] of coveredComponents.entries()) {
    const componentDebtRecords = debtIndexes.byComponent.get(component.id) ?? [];
    if (!componentHasCoverage(component, mapFiles, componentDebtRecords)) {
      errors.push({
        code: "orphan_component",
        path: `/map/components/${index}`,
        componentId: component.id,
        expected: "component backed by source_files, mapped files, or visible debt",
        actual: "component has no observed file coverage",
        fix: "Attach observed source files, remove the component, or create an explicit orphan-component debt record.",
        message: `${component.id} has no source files, mapped files, or visible debt record.`
      });
    }
  }

  return {
    valid: errors.length === 0,
    summary,
    errors
  };
}
