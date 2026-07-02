import { parseYamlArtifact, validateArtifact } from "../artifacts/schema-registry.mjs";
import { createArtifactStore } from "../artifacts/store.mjs";
import { GENERATED_VIEW_NOTICE } from "../contracts/constants.mjs";
import { evaluateGatePolicy } from "../gates/policy.mjs";
import { createOntologyViewModel, ontologyViewMarkdown } from "../ontology/view-model.mjs";

export const DEFAULT_MERMAID_LIMITS = Object.freeze({
  maxNodes: 75,
  maxEdges: 125
});

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

function createRepoMapMarkdown(map, debt, ontologyModel) {
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

${ontologyViewMarkdown(ontologyModel)}

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
  const sanitized = String(value ?? "unknown")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!sanitized) {
    return "unknown";
  }
  return /^[a-zA-Z_]/.test(sanitized) ? sanitized : `n_${sanitized}`;
}

function mermaidLabel(value) {
  return String(value ?? "unknown")
    .replace(/"/g, "'")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/\r?\n/g, " ")
    .slice(0, 90)
    .trimEnd();
}

function mermaidEdgeLabel(value) {
  return mermaidLabel(value).replace(/\|/g, "/");
}

function canonicalRef(kind, id) {
  return `${kind}.${recordId({ id })}`;
}

function viewNode(kind, id, label = id, shape = "rect") {
  return {
    id: nodeId(`${kind}_${id}`),
    label: mermaidLabel(label),
    canonicalRef: canonicalRef(kind, id),
    shape
  };
}

function viewEdge(from, to, label, canonicalRefValue) {
  return {
    from,
    to,
    label: label ? mermaidEdgeLabel(label) : undefined,
    canonicalRef: canonicalRefValue
  };
}

function mergeUniqueRecords(records) {
  const seen = new Set();
  const merged = [];
  for (const record of asList(records)) {
    const id = recordId(record, "");
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    merged.push(record);
  }
  return merged;
}

function renderNode(node) {
  if (node.shape === "round") {
    return `  ${node.id}(["${node.label}"])`;
  }
  if (node.shape === "store") {
    return `  ${node.id}[("${node.label}")]`;
  }
  if (node.shape === "diamond") {
    return `  ${node.id}{"${node.label}"}`;
  }
  return `  ${node.id}["${node.label}"]`;
}

function renderEdge(edge) {
  const label = edge.label ? `|${edge.label}|` : "";
  return `  ${edge.from} -->${label} ${edge.to}`;
}

function renderMermaidView(name, direction, nodes, edges, { limits = DEFAULT_MERMAID_LIMITS, notes = [] } = {}) {
  const maxNodes = limits.maxNodes ?? DEFAULT_MERMAID_LIMITS.maxNodes;
  const maxEdges = limits.maxEdges ?? DEFAULT_MERMAID_LIMITS.maxEdges;
  const uniqueNodes = [...new Map(asList(nodes).filter(Boolean).map((node) => [node.id, node])).values()];
  const includedNodes = uniqueNodes.slice(0, maxNodes);
  const includedNodeIds = new Set(includedNodes.map((node) => node.id));
  const omittedNodes = uniqueNodes.slice(maxNodes);
  const uniqueEdges = [
    ...new Map(
      asList(edges)
        .filter((edge) => edge?.from && edge?.to)
        .map((edge) => [`${edge.from}->${edge.to}:${edge.label ?? ""}:${edge.canonicalRef ?? ""}`, edge])
    ).values()
  ];
  const eligibleEdges = uniqueEdges.filter((edge) => includedNodeIds.has(edge.from) && includedNodeIds.has(edge.to));
  const includedEdges = eligibleEdges.slice(0, maxEdges);
  const omittedEdges = [
    ...uniqueEdges.filter((edge) => !includedNodeIds.has(edge.from) || !includedNodeIds.has(edge.to)),
    ...eligibleEdges.slice(maxEdges)
  ];
  const lines = [
    `%% ${GENERATED_VIEW_NOTICE}`,
    "%% Non-authoritative navigation view. Canonical SEAL artifacts remain the source of truth.",
    `%% View: ${name}`
  ];
  if (omittedNodes.length > 0 || omittedEdges.length > 0) {
    lines.push(`%% Truncated: omitted ${omittedNodes.length} nodes and ${omittedEdges.length} edges. See mermaid-navigation.md.`);
  }
  for (const note of notes) {
    lines.push(`%% ${mermaidLabel(note)}`);
  }
  lines.push(`flowchart ${direction}`);
  lines.push(...includedNodes.map(renderNode));
  lines.push(...includedEdges.map(renderEdge));
  if (includedNodes.length === 0) {
    lines.push("%% No canonical records available for this view.");
  }
  return {
    mermaid: `${lines.map((line) => line.trimEnd()).join("\n")}\n`,
    summary: {
      name,
      nodes: includedNodes.length,
      edges: includedEdges.length,
      omittedNodes: omittedNodes.map((node) => node.canonicalRef).filter(Boolean),
      omittedEdges: omittedEdges.map((edge) => edge.canonicalRef).filter(Boolean),
      canonicalRecords: includedNodes.map((node) => node.canonicalRef).filter(Boolean),
      notes
    }
  };
}

function idIndex(records) {
  return new Map(asList(records).map((record) => [recordId(record), record]));
}

function createMapIndexes(map) {
  return {
    components: idIndex(collectComponents(map)),
    files: new Map(collectFiles(map).map((file) => [file.path ?? recordId(file), file])),
    services: idIndex(collectServices(map)),
    interfaces: idIndex(collectInterfaces(map)),
    dataStores: idIndex(collectDataStores(map)),
    tests: idIndex(collectTests(map)),
    unknowns: idIndex(collectUnknowns(map)),
    dependencies: idIndex(collectDependencies(map))
  };
}

function componentNode(component) {
  return viewNode("map.component", recordId(component), recordId(component));
}

function fileNode(file) {
  return viewNode("map.file", file.path ?? recordId(file), file.path ?? recordId(file));
}

function dependencyNode(dependency) {
  return viewNode("map.dependency", recordId(dependency), dependency.target ?? dependency.name ?? recordId(dependency), "round");
}

function serviceNode(service) {
  return viewNode("map.service", recordId(service), recordId(service), "round");
}

function interfaceNode(interfaceRecord) {
  return viewNode("map.interface", recordId(interfaceRecord), recordId(interfaceRecord));
}

function dataStoreNode(store) {
  return viewNode("map.data_store", recordId(store), recordId(store), "store");
}

function unknownNode(unknown) {
  return viewNode("map.unknown", recordId(unknown), recordId(unknown), "diamond");
}

function createSystemMapMermaid(map, options = {}) {
  const components = collectComponents(map);
  const dependencies = collectDependencies(map);
  const services = collectServices(map);
  const dataStores = collectDataStores(map);
  const componentIds = new Set(components.map((component) => recordId(component)));
  const nodes = [];
  const edges = [];

  for (const component of components) {
    nodes.push({
      id: nodeId(recordId(component)),
      label: mermaidLabel(recordId(component)),
      canonicalRef: canonicalRef("map.component", recordId(component)),
      shape: "rect"
    });
  }
  for (const service of services) {
    const serviceViewNode = {
      id: nodeId(recordId(service)),
      label: mermaidLabel(recordId(service)),
      canonicalRef: canonicalRef("map.service", recordId(service)),
      shape: "round"
    };
    nodes.push(serviceViewNode);
    const owner = service.owner_component ?? service.owner_component_id;
    if (owner && componentIds.has(owner)) {
      edges.push(viewEdge(nodeId(owner), serviceViewNode.id, "owns", serviceViewNode.canonicalRef));
    }
  }
  for (const store of dataStores) {
    const storeViewNode = {
      id: nodeId(recordId(store)),
      label: mermaidLabel(recordId(store)),
      canonicalRef: canonicalRef("map.data_store", recordId(store)),
      shape: "store"
    };
    nodes.push(storeViewNode);
    const owner = store.owner ?? store.owner_component ?? store.owner_component_id;
    if (owner && componentIds.has(owner)) {
      edges.push(viewEdge(nodeId(owner), storeViewNode.id, "uses", storeViewNode.canonicalRef));
    }
  }
  for (const dependency of dependencies) {
    if (!dependency.source || !dependency.target) {
      continue;
    }
    if (componentIds.has(dependency.source) && componentIds.has(dependency.target)) {
      edges.push(
        viewEdge(nodeId(dependency.source), nodeId(dependency.target), "depends", canonicalRef("map.dependency", recordId(dependency)))
      );
      continue;
    }
    if (componentIds.has(dependency.source)) {
      const dependencyViewNode = {
        id: nodeId(`dep_${recordId(dependency)}`),
        label: mermaidLabel(dependency.target ?? recordId(dependency)),
        canonicalRef: canonicalRef("map.dependency", recordId(dependency)),
        shape: "round"
      };
      nodes.push(dependencyViewNode);
      edges.push(viewEdge(nodeId(dependency.source), dependencyViewNode.id, "depends", dependencyViewNode.canonicalRef));
    }
  }
  return renderMermaidView("system-map.mmd", "LR", nodes, edges, options);
}

function createComponentGraphMermaid(map, options = {}) {
  const components = collectComponents(map);
  const dependencies = collectDependencies(map);
  const nodes = [];
  const edges = [];
  const componentIds = new Set(components.map((component) => recordId(component)));

  for (const component of components) {
    const componentId = recordId(component);
    const componentViewNode = componentNode(component);
    nodes.push(componentViewNode);
    for (const file of componentFiles(map, componentId)) {
      const fileViewNode = fileNode(file);
      nodes.push(fileViewNode);
      edges.push(viewEdge(componentViewNode.id, fileViewNode.id, "owns", fileViewNode.canonicalRef));
    }
  }
  for (const dependency of dependencies) {
    if (!dependency.source || !dependency.target) {
      continue;
    }
    const sourceNodeId = componentIds.has(dependency.source) ? componentNode({ id: dependency.source }).id : undefined;
    if (!sourceNodeId) {
      continue;
    }
    if (componentIds.has(dependency.target)) {
      edges.push(
        viewEdge(sourceNodeId, componentNode({ id: dependency.target }).id, "depends", canonicalRef("map.dependency", recordId(dependency)))
      );
    } else {
      const dependencyViewNode = dependencyNode(dependency);
      nodes.push(dependencyViewNode);
      edges.push(viewEdge(sourceNodeId, dependencyViewNode.id, "depends", dependencyViewNode.canonicalRef));
    }
  }
  return renderMermaidView("component-graph.mmd", "TD", nodes, edges, options);
}

function createInterfaceDataFlowMermaid(map, options = {}) {
  const interfaces = collectInterfaces(map);
  const dataStores = collectDataStores(map);
  const services = collectServices(map);
  const components = collectComponents(map);
  const files = collectFiles(map);
  const componentIds = new Set(components.map((component) => recordId(component)));
  const fileIds = new Set(files.map((file) => file.path ?? recordId(file)));
  const nodes = [];
  const edges = [];

  for (const component of components) {
    nodes.push(componentNode(component));
  }
  for (const file of files) {
    if (asList(file.interfaces ?? file.exports ?? file.routes).length > 0) {
      nodes.push(fileNode(file));
      const owner = file.owner_component_id ?? file.component_id;
      if (owner && componentIds.has(owner)) {
        edges.push(viewEdge(componentNode({ id: owner }).id, fileNode(file).id, "owns", fileNode(file).canonicalRef));
      }
    }
  }
  for (const service of services) {
    const serviceViewNode = serviceNode(service);
    nodes.push(serviceViewNode);
    const owner = service.owner_component ?? service.owner_component_id;
    if (owner && componentIds.has(owner)) {
      edges.push(viewEdge(componentNode({ id: owner }).id, serviceViewNode.id, "calls", serviceViewNode.canonicalRef));
    }
  }
  for (const interfaceRecord of interfaces) {
    const interfaceViewNode = interfaceNode(interfaceRecord);
    nodes.push(interfaceViewNode);
    const owner = interfaceRecord.owner_component_id ?? interfaceRecord.owner_file ?? interfaceRecord.owner;
    if (owner && componentIds.has(owner)) {
      edges.push(viewEdge(componentNode({ id: owner }).id, interfaceViewNode.id, "exposes", interfaceViewNode.canonicalRef));
    } else if (owner && fileIds.has(owner)) {
      edges.push(viewEdge(fileNode({ path: owner }).id, interfaceViewNode.id, "exposes", interfaceViewNode.canonicalRef));
    }
  }
  for (const store of dataStores) {
    const storeViewNode = dataStoreNode(store);
    nodes.push(storeViewNode);
    const owner = store.owner ?? store.owner_component ?? store.owner_component_id;
    if (owner && componentIds.has(owner)) {
      edges.push(viewEdge(componentNode({ id: owner }).id, storeViewNode.id, "reads/writes", storeViewNode.canonicalRef));
    }
  }
  return renderMermaidView("interface-data-flow.mmd", "LR", nodes, edges, options);
}

function collectPlanRecords(plan) {
  if (!plan) {
    return [];
  }
  const records = [];
  if (plan.id) {
    records.push({ id: plan.id, summary: plan.objective?.summary ?? plan.summary ?? "Plan baseline", kind: "plan" });
  }
  for (const [kind, values] of [
    ["plan.scope", plan.scope],
    ["plan.scenario", plan.scenarios],
    ["plan.acceptance", plan.acceptance_criteria],
    ["plan.proof_obligation", plan.proof_obligations],
    ["plan.approval", plan.approval_needs]
  ]) {
    for (const record of asList(values)) {
      records.push({ ...record, kind });
    }
  }
  return records;
}

function collectSources(map, sources) {
  return mergeUniqueRecords([...asList(sources?.sources), ...asList(map.sources)]);
}

function traceEndpointNode(endpoint, nodeByRecordId) {
  return nodeByRecordId.get(endpoint);
}

function createTraceabilityMermaid({ map, plan, trace, sources, limits }) {
  const nodes = [];
  const edges = [];
  const notes = [];
  const nodeByRecordId = new Map();
  const addRecordNode = (record, kind, shape = "rect") => {
    const id = recordId(record, "");
    if (!id) {
      return undefined;
    }
    const node = viewNode(kind, id, id, shape);
    nodes.push(node);
    nodeByRecordId.set(id, node);
    return node;
  };

  for (const source of collectSources(map, sources)) {
    addRecordNode(source, "source", "round");
  }
  for (const record of collectPlanRecords(plan)) {
    addRecordNode(record, record.kind ?? "plan");
  }
  for (const component of collectComponents(map)) {
    addRecordNode(component, "map.component");
  }
  for (const file of collectFiles(map)) {
    addRecordNode(file, "map.file");
  }
  for (const unknown of collectUnknowns(map)) {
    addRecordNode(unknown, "map.unknown", "diamond");
  }
  for (const relation of [...asList(trace?.relations), ...asList(map.trace_links), ...asList(map.relationships)]) {
    const from = traceEndpointNode(relation.from, nodeByRecordId);
    const to = traceEndpointNode(relation.to, nodeByRecordId);
    if (!from || !to) {
      notes.push(`Excluded ${recordId(relation)} because one endpoint is not in canonical records.`);
      continue;
    }
    edges.push(viewEdge(from.id, to.id, relation.type ?? relation.relationship ?? "traces", canonicalRef("trace.relation", recordId(relation))));
  }
  for (const record of [...collectComponents(map), ...collectFiles(map), ...collectUnknowns(map), ...collectPlanRecords(plan)]) {
    const target = nodeByRecordId.get(recordId(record));
    for (const sourceRef of asList(record.source_refs)) {
      const source = nodeByRecordId.get(sourceRef);
      if (source && target) {
        edges.push(viewEdge(source.id, target.id, "supports", target.canonicalRef));
      }
    }
  }
  return renderMermaidView("traceability.mmd", "LR", nodes, edges, { limits, notes });
}

function createProofEvidenceMermaid({ proof, evidenceIndex, limits }) {
  const nodes = [];
  const edges = [];
  const claimNodes = new Map();
  const evidenceNodes = new Map();
  const gapNodes = new Map();

  for (const claim of asList(proof?.claims)) {
    const node = viewNode("proof.claim", recordId(claim), `${recordId(claim)} (${claim.status ?? "unknown"})`);
    nodes.push(node);
    claimNodes.set(recordId(claim), node);
  }
  for (const evidence of mergeUniqueRecords([...asList(proof?.evidence), ...asList(evidenceIndex?.evidence)])) {
    const status = evidence.status ?? evidence.result ?? "unknown";
    const node = viewNode("evidence", recordId(evidence), `${recordId(evidence)} (${status})`, "round");
    nodes.push(node);
    evidenceNodes.set(recordId(evidence), node);
  }
  for (const gap of asList(proof?.gaps)) {
    const node = viewNode("proof.gap", recordId(gap), recordId(gap), "diamond");
    nodes.push(node);
    gapNodes.set(recordId(gap), node);
  }
  for (const claim of asList(proof?.claims)) {
    const claimNode = claimNodes.get(recordId(claim));
    for (const evidenceRef of asList(claim.evidence_refs)) {
      const evidenceNode = evidenceNodes.get(evidenceRef);
      if (claimNode && evidenceNode) {
        edges.push(viewEdge(evidenceNode.id, claimNode.id, "supports", evidenceNode.canonicalRef));
      }
    }
    for (const evidenceRef of asList(claim.counterevidence_refs)) {
      const evidenceNode = evidenceNodes.get(evidenceRef);
      if (claimNode && evidenceNode) {
        edges.push(viewEdge(evidenceNode.id, claimNode.id, "refutes", evidenceNode.canonicalRef));
      }
    }
    for (const gapRef of asList(claim.gap_refs)) {
      const gapNode = gapNodes.get(gapRef);
      if (claimNode && gapNode) {
        edges.push(viewEdge(claimNode.id, gapNode.id, "blocked by", gapNode.canonicalRef));
      }
    }
  }
  for (const evidence of asList(proof?.evidence)) {
    const evidenceNode = evidenceNodes.get(recordId(evidence));
    for (const claimRef of asList(evidence.supports)) {
      const claimNode = claimNodes.get(claimRef);
      if (evidenceNode && claimNode) {
        edges.push(viewEdge(evidenceNode.id, claimNode.id, "supports", evidenceNode.canonicalRef));
      }
    }
    for (const claimRef of asList(evidence.refutes)) {
      const claimNode = claimNodes.get(claimRef);
      if (evidenceNode && claimNode) {
        edges.push(viewEdge(evidenceNode.id, claimNode.id, "refutes", evidenceNode.canonicalRef));
      }
    }
  }
  for (const evidence of asList(evidenceIndex?.evidence)) {
    const evidenceNode = evidenceNodes.get(recordId(evidence));
    for (const claimRef of asList(evidence.claim_ids)) {
      const claimNode = claimNodes.get(claimRef);
      if (evidenceNode && claimNode) {
        edges.push(viewEdge(evidenceNode.id, claimNode.id, "indexes", evidenceNode.canonicalRef));
      }
    }
  }
  return renderMermaidView("proof-evidence.mmd", "LR", nodes, edges, { limits });
}

function readinessNodesFromImpacts(impacts) {
  const nodes = [];
  const edges = [];
  const impactNodes = new Map();
  for (const impact of asList(impacts)) {
    const impactViewNode = viewNode("impact", recordId(impact), recordId(impact), "round");
    nodes.push(impactViewNode);
    impactNodes.set(recordId(impact), impactViewNode);
    for (const record of asList(impact.proof_required)) {
      const node = viewNode("impact.proof_required", recordId(record), recordId(record), "diamond");
      nodes.push(node);
      edges.push(viewEdge(impactViewNode.id, node.id, "requires proof", node.canonicalRef));
    }
    for (const record of asList(impact.approval_needed)) {
      const node = viewNode("impact.approval", recordId(record), recordId(record), "diamond");
      nodes.push(node);
      edges.push(viewEdge(impactViewNode.id, node.id, "needs approval", node.canonicalRef));
    }
    for (const gap of [...asList(impact.blocking_unknowns), ...asList(impact.gaps)]) {
      const node = viewNode("impact.gap", recordId(gap), recordId(gap), "diamond");
      nodes.push(node);
      edges.push(viewEdge(impactViewNode.id, node.id, "blocked by", node.canonicalRef));
    }
  }
  return { nodes, edges };
}

function readinessNodesFromFly(flyRecords) {
  const nodes = [];
  const edges = [];
  for (const fly of asList(flyRecords)) {
    const flyViewNode = viewNode("fly", recordId(fly), recordId(fly), "round");
    nodes.push(flyViewNode);
    for (const [section, records] of [
      ["stop rule", fly.stop_rules ?? fly.rollback_or_stop_rules],
      ["failure", fly.failures],
      ["new unknown", fly.learning?.new_unknowns],
      ["proof update", fly.learning?.proof_updates_required],
      ["next cycle", fly.learning?.next_fly_cycle]
    ]) {
      for (const record of asList(records)) {
        const node = viewNode("fly.record", recordId(record), recordId(record), "diamond");
        nodes.push(node);
        edges.push(viewEdge(flyViewNode.id, node.id, section, node.canonicalRef));
      }
    }
  }
  return { nodes, edges };
}

function createReadinessBlockersMermaid({ map, proof, evidenceIndex, impacts, flyRecords, policy, limits }) {
  const nodes = [];
  const edges = [];
  const blockerNodesByRef = new Map();
  const addBlocker = (kind, record, shape = "diamond") => {
    const node = viewNode(kind, recordId(record), recordId(record), shape);
    nodes.push(node);
    blockerNodesByRef.set(recordId(record), node);
    return node;
  };

  for (const unknown of collectUnknowns(map)) {
    addBlocker("map.unknown", unknown);
  }
  for (const gap of asList(proof?.gaps)) {
    addBlocker("proof.gap", gap);
  }
  for (const evidence of mergeUniqueRecords([...asList(proof?.evidence), ...asList(evidenceIndex?.evidence)])) {
    const status = evidence.status ?? evidence.result;
    if (["failed", "fail", "stale", "missing", "gap"].includes(String(status ?? "").toLowerCase())) {
      addBlocker("evidence", evidence);
    }
  }
  const impactGraph = readinessNodesFromImpacts(impacts);
  nodes.push(...impactGraph.nodes);
  edges.push(...impactGraph.edges);
  const flyGraph = readinessNodesFromFly(flyRecords);
  nodes.push(...flyGraph.nodes);
  edges.push(...flyGraph.edges);

  for (const decision of asList(policy?.decisions)) {
    if (decision.status === "pass") {
      continue;
    }
    const decisionNode = viewNode("gate.decision", decision.id, `${decision.id} (${decision.status})`, "diamond");
    nodes.push(decisionNode);
    for (const ref of asList(decision.artifact_refs)) {
      const blocker = blockerNodesByRef.get(ref);
      if (blocker) {
        edges.push(viewEdge(decisionNode.id, blocker.id, "blocked by", blocker.canonicalRef));
      }
    }
  }
  return renderMermaidView("readiness-blockers.mmd", "TD", nodes, edges, { limits });
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

function countTraceRelations(map, trace) {
  return asList(trace?.relations).length + asList(map.trace_links).length + asList(map.relationships).length;
}

function createMermaidNavigationMarkdown(viewSummaries, limits = DEFAULT_MERMAID_LIMITS) {
  const entries = Object.entries(viewSummaries);
  const omittedNodes = entries.flatMap(([, summary]) => summary.omittedNodes);
  const omittedEdges = entries.flatMap(([, summary]) => summary.omittedEdges);
  const lines = [
    "# SEAL Mermaid Navigation",
    "",
    GENERATED_VIEW_NOTICE,
    "",
    "This is a generated, non-authoritative navigation companion. Canonical SEAL YAML artifacts remain the source of truth.",
    "",
    "## Limits",
    "",
    `- Max nodes per diagram: ${limits.maxNodes ?? DEFAULT_MERMAID_LIMITS.maxNodes}`,
    `- Max edges per diagram: ${limits.maxEdges ?? DEFAULT_MERMAID_LIMITS.maxEdges}`,
    "",
    "## Views",
    ""
  ];

  for (const [fileName, summary] of entries) {
    lines.push(
      `### ${fileName}`,
      "",
      `- Included nodes: ${summary.nodes}`,
      `- Included edges: ${summary.edges}`,
      `- Canonical records: ${summary.canonicalRecords.length ? summary.canonicalRecords.join(", ") : "none"}`,
      `- Omitted canonical records: ${summary.omittedNodes.length ? summary.omittedNodes.join(", ") : "none"}`,
      `- Omitted relationships: ${summary.omittedEdges.length ? summary.omittedEdges.join(", ") : "none"}`
    );
    if (summary.notes.length > 0) {
      lines.push(`- Notes: ${summary.notes.join("; ")}`);
    }
    lines.push("");
  }

  lines.push(
    "## Coverage",
    "",
    `- Views: ${entries.length}`,
    `- Omitted nodes across views: ${omittedNodes.length}`,
    `- Omitted relationships across views: ${omittedEdges.length}`
  );
  return `${lines.join("\n")}\n`;
}

export function createMapViews(
  map,
  {
    debt,
    plan,
    trace,
    proof,
    evidenceIndex,
    sources,
    impacts = [],
    fly,
    flyRecords,
    validation,
    profile,
    ontology,
    limits = DEFAULT_MERMAID_LIMITS
  } = {}
) {
  const resolvedFlyRecords = flyRecords ?? (Array.isArray(fly) ? fly : asList(fly ? [fly] : []));
  const resolvedImpacts = asList(impacts);
  const policy = evaluateGatePolicy({
    validation,
    map,
    impact: resolvedImpacts[0],
    proof,
    evidenceIndex,
    profile
  });
  const ontologyModel = createOntologyViewModel({ ontology, map, trace, proof, debt, impacts: resolvedImpacts, flyRecords: resolvedFlyRecords });
  const ontologyNotes = [
    `Ontology ${ontologyModel.ontology_id}`,
    `Entity types ${ontologyModel.entity_types.join(", ") || "not recorded"}`,
    `Relationship types ${ontologyModel.relationship_types.join(", ") || "not recorded"}`,
    `States proof=${ontologyModel.observed_states.proof.join(", ") || "not recorded"} approval=${ontologyModel.observed_states.approval.join(", ") || "not recorded"} gap=${ontologyModel.observed_states.gap.join(", ") || "not recorded"}`
  ];
  const systemMap = createSystemMapMermaid(map, { limits, notes: ontologyNotes });
  const componentGraph = createComponentGraphMermaid(map, { limits, notes: ontologyNotes });
  const interfaceDataFlow = createInterfaceDataFlowMermaid(map, { limits, notes: ontologyNotes });
  const traceability = createTraceabilityMermaid({ map, plan, trace, sources, limits });
  const proofEvidence = createProofEvidenceMermaid({ proof, evidenceIndex, limits });
  const readinessBlockers = createReadinessBlockersMermaid({
    map,
    proof,
    evidenceIndex,
    impacts: resolvedImpacts,
    flyRecords: resolvedFlyRecords,
    policy,
    limits
  });
  const viewSummaries = {
    "system-map.mmd": systemMap.summary,
    "component-graph.mmd": componentGraph.summary,
    "interface-data-flow.mmd": interfaceDataFlow.summary,
    "traceability.mmd": traceability.summary,
    "proof-evidence.mmd": proofEvidence.summary,
    "readiness-blockers.mmd": readinessBlockers.summary
  };

  return {
    markdown: createRepoMapMarkdown(map, debt, ontologyModel),
    mermaid: systemMap.mermaid,
    componentGraph: componentGraph.mermaid,
    interfaceDataFlow: interfaceDataFlow.mermaid,
    traceability: traceability.mermaid,
    proofEvidence: proofEvidence.mermaid,
    readinessBlockers: readinessBlockers.mermaid,
    debtMarkdown: createDebtMarkdown(map, debt),
    navigationMarkdown: createMermaidNavigationMarkdown(viewSummaries, limits),
    navigationSummary: {
      limits,
      views: viewSummaries
    },
    summary: {
      ...summarize(map, debt),
      traceRelations: countTraceRelations(map, trace),
      proofClaims: asList(proof?.claims).length,
      evidence: mergeUniqueRecords([...asList(proof?.evidence), ...asList(evidenceIndex?.evidence)]).length,
      impacts: resolvedImpacts.length,
      fly: resolvedFlyRecords.length
    },
    ontologyModel
  };
}

export async function writeMapViews(rootDir, options = {}) {
  const store = createArtifactStore(rootDir);
  const mapPath = store.pathFor("map");
  const map = await parseYamlArtifact(mapPath);
  const validation = await validateArtifact("map", map);
  if (!validation.valid) {
    const details = validation.errors.map((error) => `${error.path} ${error.message}`).join("; ");
    throw new Error(`MAP artifact is invalid: ${details}`);
  }

  const artifactSet = (await store.readCanonicalSet({ validate: true, mode: "fail-fast" })).artifactSet;
  const { debt, ontology, plan, trace, proof, sources, evidenceIndex, impacts, flyRecords } = artifactSet;
  const views = createMapViews(map, {
    debt,
    ontology,
    plan,
    trace,
    proof,
    sources,
    evidenceIndex,
    impacts,
    flyRecords,
    limits: options.limits,
    profile: options.profile
  });
  const repoMapPath = (await store.writeDerived("repoMap", views.markdown, { reason: "write_map_views" })).filePath;
  const systemMapPath = (await store.writeDerived("systemMap", views.mermaid, { reason: "write_map_views" })).filePath;
  const componentGraphPath = (await store.writeDerived("componentGraph", views.componentGraph, { reason: "write_map_views" })).filePath;
  const interfaceDataFlowPath = (await store.writeDerived("interfaceDataFlow", views.interfaceDataFlow, { reason: "write_map_views" })).filePath;
  const traceabilityPath = (await store.writeDerived("traceability", views.traceability, { reason: "write_map_views" })).filePath;
  const proofEvidencePath = (await store.writeDerived("proofEvidence", views.proofEvidence, { reason: "write_map_views" })).filePath;
  const readinessBlockersPath = (await store.writeDerived("readinessBlockers", views.readinessBlockers, { reason: "write_map_views" })).filePath;
  const navigationPath = (await store.writeDerived("mermaidNavigation", views.navigationMarkdown, { reason: "write_map_views" })).filePath;
  const debtPath = (await store.writeDerived("debtView", views.debtMarkdown, { reason: "write_map_views" })).filePath;
  const legacyMarkdownPath = (await store.writeDerived("legacyMapMarkdown", views.markdown, { reason: "write_map_views" })).filePath;
  const legacyMermaidPath = (await store.writeDerived("legacyMapMermaid", views.mermaid, { reason: "write_map_views" })).filePath;

  return {
    ...views,
    outputPath: repoMapPath,
    repoMapPath,
    systemMapPath,
    componentGraphPath,
    interfaceDataFlowPath,
    traceabilityPath,
    proofEvidencePath,
    readinessBlockersPath,
    navigationPath,
    debtPath,
    legacyMarkdownPath,
    legacyMermaidPath
  };
}
