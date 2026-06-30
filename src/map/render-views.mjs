import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseYamlArtifact, validateArtifact } from "../artifacts/schema-registry.mjs";
import { GENERATED_VIEW_NOTICE } from "../contracts/constants.mjs";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function valueSummary(value, fallback = "Not captured") {
  if (value && typeof value === "object" && "summary" in value) {
    return value.summary;
  }
  if (value && typeof value === "object") {
    const parts = [];
    if (value.root) {
      parts.push(`root=${value.root}`);
    }
    if (Array.isArray(value.included) && value.included.length > 0) {
      parts.push(`included=${value.included.join(", ")}`);
    }
    if (Array.isArray(value.excluded) && value.excluded.length > 0) {
      parts.push(`excluded=${value.excluded.join(", ")}`);
    }
    return parts.length > 0 ? parts.join("; ") : fallback;
  }
  return value || fallback;
}

function recordId(record, fallback = "unknown") {
  return record?.id ?? record?.path ?? record?.name ?? record?.subject ?? fallback;
}

function recordSummary(record, fallback = "") {
  return valueSummary(record?.summary ?? record?.purpose ?? record?.reason ?? record?.name ?? record?.path, fallback);
}

function componentFiles(map, componentId) {
  const files = asList(map.files);
  return files.filter((file) => (file.owner_component_id ?? file.component_id) === componentId);
}

function collectComponents(map) {
  return asList(map.components ?? map.observed?.components);
}

function collectFiles(map) {
  return asList(map.files ?? map.observed?.files);
}

function collectDependencies(map) {
  const explicit = asList(map.dependencies ?? map.observed?.dependencies);
  const componentDependencies = collectComponents(map).flatMap((component) =>
    asList(component.dependencies).map((dependency) => ({
      id: `${recordId(component)} -> ${typeof dependency === "string" ? dependency : recordId(dependency)}`,
      source: recordId(component),
      target: typeof dependency === "string" ? dependency : recordId(dependency),
      kind: "component"
    }))
  );
  const fileDependencies = collectFiles(map).flatMap((file) =>
    asList(file.imports ?? file.dependencies).map((dependency) => ({
      id: `${file.path} -> ${dependency}`,
      source: file.path,
      target: dependency,
      kind: "file"
    }))
  );
  return [...explicit, ...componentDependencies, ...fileDependencies];
}

function collectServices(map) {
  if (Array.isArray(map.services)) {
    return map.services;
  }
  return asList(map.services?.discovered);
}

function collectNegativeServiceEvidence(map) {
  if (Array.isArray(map.services?.negative_evidence)) {
    return map.services.negative_evidence;
  }
  return asList(map.service_discovery?.negative_evidence);
}

function collectInterfaces(map) {
  const explicit = asList(map.interfaces ?? map.approved?.interfaces);
  const componentInterfaces = collectComponents(map).flatMap((component) =>
    asList(component.interfaces).map((interfaceId) => ({
      id: interfaceId,
      owner_component_id: recordId(component),
      kind: "component"
    }))
  );
  const fileInterfaces = collectFiles(map).flatMap((file) =>
    asList(file.interfaces ?? file.exports ?? file.routes).map((interfaceId) => ({
      id: typeof interfaceId === "string" ? interfaceId : recordId(interfaceId),
      owner_file: file.path,
      kind: "file"
    }))
  );
  return [...explicit, ...componentInterfaces, ...fileInterfaces];
}

function collectDataStores(map) {
  const explicit = asList(map.data_stores ?? map.approved?.data_stores);
  const componentStores = collectComponents(map).flatMap((component) =>
    asList(component.data_stores).map((storeId) => ({
      id: storeId,
      owner_component_id: recordId(component),
      kind: "component"
    }))
  );
  return [...explicit, ...componentStores];
}

function collectTests(map) {
  const explicit = asList(map.tests);
  const inferred = collectFiles(map)
    .filter((file) => file.classification === "test" || file.role === "test" || /\b(test|spec)\b/i.test(file.path ?? ""))
    .map((file) => ({ id: file.path, path: file.path, kind: "file" }));
  return [...explicit, ...inferred];
}

function collectUnknowns(map) {
  return [...asList(map.unknowns), ...asList(map.gaps), ...asList(map.drift)];
}

function collectDebt(debt) {
  return asList(debt?.records);
}

function summarize(map, debt) {
  return {
    components: collectComponents(map).length,
    files: collectFiles(map).length,
    dependencies: collectDependencies(map).length,
    services: collectServices(map).length,
    interfaces: collectInterfaces(map).length,
    dataStores: collectDataStores(map).length,
    tests: collectTests(map).length,
    gaps: asList(map.gaps).length,
    unknowns: collectUnknowns(map).length,
    debt: collectDebt(debt).length
  };
}

function markdownList(records, formatter, empty = "- None recorded.") {
  const items = asList(records);
  if (items.length === 0) {
    return empty;
  }
  return items.map(formatter).join("\n");
}

function createRepoMapMarkdown(map, debt) {
  const summary = summarize(map, debt);
  const components = collectComponents(map);
  const files = collectFiles(map);
  const dependencies = collectDependencies(map);
  const services = collectServices(map);
  const serviceNegativeEvidence = collectNegativeServiceEvidence(map);
  const interfaces = collectInterfaces(map);
  const dataStores = collectDataStores(map);
  const tests = collectTests(map);
  const unknowns = collectUnknowns(map);

  return `# SEAL Repo Map

${GENERATED_VIEW_NOTICE}

## Purpose

${valueSummary(map.purpose)}

## Boundary

${valueSummary(map.boundary)}

## Summary

- Components: ${summary.components}
- Files: ${summary.files}
- Dependencies: ${summary.dependencies}
- Services: ${summary.services}
- Interfaces: ${summary.interfaces}
- Data stores: ${summary.dataStores}
- Tests: ${summary.tests}
- Unknowns: ${summary.unknowns}
- Visible debt: ${summary.debt}

## Observed Reality

${markdownList(components, (component) => {
    const ownedFiles = componentFiles(map, recordId(component)).map((file) => file.path);
    return `- ${recordId(component)}: ${recordSummary(component, "No purpose captured.")}${ownedFiles.length ? `\n  - files: ${ownedFiles.join(", ")}` : ""}`;
  })}

## Approved Architecture

- Components: ${asList(map.approved?.components).length}
- Boundaries: ${asList(map.approved?.boundaries).length}
- Interfaces: ${asList(map.approved?.interfaces).length}
- Data stores: ${asList(map.approved?.data_stores).length}

## Files By Component

${markdownList(components, (component) => {
    const ownedFiles = componentFiles(map, recordId(component));
    return `- ${recordId(component)}\n${markdownList(ownedFiles, (file) => `  - ${file.path} (${file.classification ?? file.role ?? "unknown"})`, "  - No files mapped.")}`;
  })}

## Dependencies

${markdownList(dependencies, (dependency) => `- ${recordId(dependency)}: ${dependency.source ?? dependency.name ?? "unknown"} -> ${dependency.target ?? dependency.version ?? "unknown"}`)}

## Services And Cost

${markdownList(services, (service) => `- ${recordId(service)}: ${recordSummary(service, "No purpose captured.")} owner=${service.owner_component ?? service.owner_component_id ?? "unknown"} cost=${service.cost_model ?? "unknown"} risk=${service.data_risk ?? "unknown"}`)}

### Negative Service Evidence

${markdownList(serviceNegativeEvidence, (item) => `- ${typeof item === "string" ? item : recordSummary(item)}`)}

## Interfaces

${markdownList(interfaces, (interfaceRecord) => `- ${recordId(interfaceRecord)}: owner=${interfaceRecord.owner_component_id ?? interfaceRecord.owner_file ?? interfaceRecord.owner ?? "unknown"}`)}

## Data Stores

${markdownList(dataStores, (store) => `- ${recordId(store)}: owner=${store.owner ?? store.owner_component ?? store.owner_component_id ?? "unknown"} proof=${asList(store.proof_gaps).length ? store.proof_gaps.join(", ") : "not linked"}`)}

## Tests

${markdownList(tests, (test) => `- ${recordId(test)}${test.path && test.path !== recordId(test) ? `: ${test.path}` : ""}`)}

## Unknowns And Drift

${markdownList(unknowns, (unknown) => `- ${recordId(unknown)}: ${recordSummary(unknown, "Unknown needs resolution.")}`)}

## Sources

${markdownList(asList(map.sources), (source) => `- ${recordId(source)}: ${recordSummary(source, "Source recorded.")}`)}
`;
}

function nodeId(value) {
  return String(value ?? "unknown").replace(/[^a-zA-Z0-9_]/g, "_");
}

function mermaidLabel(value) {
  return String(value ?? "unknown").replace(/"/g, "'");
}

function createSystemMapMermaid(map) {
  const components = collectComponents(map);
  const dependencies = collectDependencies(map);
  const services = collectServices(map);
  const dataStores = collectDataStores(map);

  const lines = [`%% ${GENERATED_VIEW_NOTICE}`, "flowchart LR"];
  for (const component of components) {
    lines.push(`  ${nodeId(recordId(component))}["${mermaidLabel(recordId(component))}"]`);
  }
  for (const service of services) {
    lines.push(`  ${nodeId(recordId(service))}(["${mermaidLabel(recordId(service))}"])`);
    const owner = service.owner_component ?? service.owner_component_id;
    if (owner) {
      lines.push(`  ${nodeId(owner)} --> ${nodeId(recordId(service))}`);
    }
  }
  for (const store of dataStores) {
    lines.push(`  ${nodeId(recordId(store))}[("${mermaidLabel(recordId(store))}")]`);
    const owner = store.owner ?? store.owner_component ?? store.owner_component_id;
    if (owner) {
      lines.push(`  ${nodeId(owner)} --> ${nodeId(recordId(store))}`);
    }
  }
  for (const dependency of dependencies.slice(0, 100)) {
    if (dependency.source && dependency.target) {
      lines.push(`  ${nodeId(dependency.source)} --> ${nodeId(dependency.target)}`);
    }
  }
  if (lines.length === 2) {
    lines.push(`  empty["No component graph recorded"]`);
  }
  return `${lines.join("\n")}\n`;
}

function createComponentGraphMermaid(map) {
  const components = collectComponents(map);
  const lines = [`%% ${GENERATED_VIEW_NOTICE}`, "flowchart TD"];
  for (const component of components) {
    const componentId = recordId(component);
    lines.push(`  ${nodeId(componentId)}["${mermaidLabel(componentId)}"]`);
    for (const file of componentFiles(map, componentId).slice(0, 40)) {
      const fileNode = nodeId(`${componentId}_${file.path}`);
      lines.push(`  ${fileNode}["${mermaidLabel(file.path)}"]`);
      lines.push(`  ${nodeId(componentId)} --> ${fileNode}`);
    }
  }
  if (lines.length === 2) {
    lines.push(`  empty["No components recorded"]`);
  }
  return `${lines.join("\n")}\n`;
}

function createInterfaceDataFlowMermaid(map) {
  const interfaces = collectInterfaces(map);
  const dataStores = collectDataStores(map);
  const lines = [`%% ${GENERATED_VIEW_NOTICE}`, "flowchart LR"];
  for (const interfaceRecord of interfaces) {
    const id = recordId(interfaceRecord);
    lines.push(`  ${nodeId(id)}["${mermaidLabel(id)}"]`);
    const owner = interfaceRecord.owner_component_id ?? interfaceRecord.owner_file ?? interfaceRecord.owner;
    if (owner) {
      lines.push(`  ${nodeId(owner)} --> ${nodeId(id)}`);
    }
  }
  for (const store of dataStores) {
    const id = recordId(store);
    lines.push(`  ${nodeId(id)}[("${mermaidLabel(id)}")]`);
    const owner = store.owner ?? store.owner_component ?? store.owner_component_id;
    if (owner) {
      lines.push(`  ${nodeId(owner)} --> ${nodeId(id)}`);
    }
  }
  if (lines.length === 2) {
    lines.push(`  empty["No interface or data-flow records"]`);
  }
  return `${lines.join("\n")}\n`;
}

function createDebtMarkdown(map, debt) {
  const records = collectDebt(debt);
  const unknowns = collectUnknowns(map);
  const debtByType = records.reduce((accumulator, record) => {
    accumulator[record.type ?? "unknown"] = (accumulator[record.type ?? "unknown"] ?? 0) + 1;
    return accumulator;
  }, {});

  return `# SEAL Visible Debt

${GENERATED_VIEW_NOTICE}

## Summary

${markdownList(Object.entries(debtByType), ([type, count]) => `- ${type}: ${count}`, "- No structured debt records.")}

## Debt Records

${markdownList(records, (record) => `- ${record.id}: ${record.type} ${record.severity ?? "warning"} ${record.status ?? "open"} - ${record.subject ?? record.summary ?? "No subject"}`)}

## Unknowns

${markdownList(unknowns, (unknown) => `- ${recordId(unknown)}: ${recordSummary(unknown, "Unknown needs resolution.")}`)}
`;
}

export function createMapViews(map, { debt } = {}) {
  return {
    markdown: createRepoMapMarkdown(map, debt),
    mermaid: createSystemMapMermaid(map),
    componentGraph: createComponentGraphMermaid(map),
    interfaceDataFlow: createInterfaceDataFlowMermaid(map),
    debtMarkdown: createDebtMarkdown(map, debt),
    summary: summarize(map, debt)
  };
}

async function readOptionalArtifact(filePath, artifactType) {
  try {
    const artifact = await parseYamlArtifact(filePath);
    const result = await validateArtifact(artifactType, artifact);
    if (!result.valid) {
      const details = result.errors.map((error) => `${error.path} ${error.message}`).join("; ");
      throw new Error(`${artifactType} artifact is invalid: ${details}`);
    }
    return artifact;
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function writeMapViews(rootDir) {
  const sealDir = path.join(rootDir, ".seal");
  const mapPath = path.join(sealDir, "map.yaml");
  const debtArtifactPath = path.join(sealDir, "debt.yaml");
  const map = await parseYamlArtifact(mapPath);
  const validation = await validateArtifact("map", map);
  if (!validation.valid) {
    const details = validation.errors.map((error) => `${error.path} ${error.message}`).join("; ");
    throw new Error(`MAP artifact is invalid: ${details}`);
  }

  const debt = await readOptionalArtifact(debtArtifactPath, "debt");
  const views = createMapViews(map, { debt });
  const viewsDir = path.join(sealDir, "views");
  const reportsDir = path.join(sealDir, "reports");
  await mkdir(viewsDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });

  const repoMapPath = path.join(viewsDir, "repo-map.md");
  const systemMapPath = path.join(viewsDir, "system-map.mmd");
  const componentGraphPath = path.join(viewsDir, "component-graph.mmd");
  const interfaceDataFlowPath = path.join(viewsDir, "interface-data-flow.mmd");
  const debtPath = path.join(viewsDir, "debt.md");
  const legacyMarkdownPath = path.join(reportsDir, "map.md");
  const legacyMermaidPath = path.join(reportsDir, "map.mmd");

  await writeFile(repoMapPath, views.markdown, "utf8");
  await writeFile(systemMapPath, views.mermaid, "utf8");
  await writeFile(componentGraphPath, views.componentGraph, "utf8");
  await writeFile(interfaceDataFlowPath, views.interfaceDataFlow, "utf8");
  await writeFile(debtPath, views.debtMarkdown, "utf8");
  await writeFile(legacyMarkdownPath, views.markdown, "utf8");
  await writeFile(legacyMermaidPath, views.mermaid, "utf8");

  return {
    ...views,
    outputPath: repoMapPath,
    repoMapPath,
    systemMapPath,
    componentGraphPath,
    interfaceDataFlowPath,
    debtPath,
    legacyMarkdownPath,
    legacyMermaidPath
  };
}
