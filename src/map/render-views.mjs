import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseYamlArtifact, validateArtifact } from "../artifacts/schema-registry.mjs";
import { validateArtifactReferences } from "../artifacts/reference-integrity.mjs";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function joinList(values) {
  const filtered = asArray(values).filter(Boolean);
  return filtered.length === 0 ? "none" : filtered.join(", ");
}

function tableCell(value) {
  return String(value ?? "none").replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

function table(headers, rows) {
  const head = `| ${headers.map(tableCell).join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(tableCell).join(" | ")} |`);
  return [head, divider, ...body].join("\n");
}

function slug(value) {
  const text = String(value ?? "unknown").replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return text.length === 0 ? "unknown" : text;
}

function mermaidId(prefix, value) {
  return `${prefix}_${slug(value)}`;
}

function mermaidLabel(value) {
  return String(value ?? "unknown").replaceAll('"', "'").replace(/\r?\n/g, " ");
}

function sortByIdOrPath(left, right) {
  return String(left.id ?? left.path ?? "").localeCompare(String(right.id ?? right.path ?? ""));
}

function openGaps(map) {
  return asArray(map.gaps).filter((gap) => gap.status !== "closed");
}

function buildIndexes(map) {
  const componentsById = new Map(asArray(map.components).map((component) => [component.id, component]));
  const filesByPath = new Map(asArray(map.files).map((file) => [file.path, file]));
  const gapsById = new Map(asArray(map.gaps).map((gap) => [gap.id, gap]));
  return { componentsById, filesByPath, gapsById };
}

function collectFileDependencies(map) {
  const dependencies = [];
  for (const file of asArray(map.files)) {
    for (const dependency of asArray(file.dependencies)) {
      dependencies.push({
        ownerType: "file",
        ownerId: file.path,
        ownerComponentId: file.component_id,
        ...dependency
      });
    }
  }
  for (const component of asArray(map.components)) {
    for (const dependency of asArray(component.dependencies)) {
      dependencies.push({
        ownerType: "component",
        ownerId: component.id,
        ownerComponentId: component.id,
        ...dependency
      });
    }
  }
  return dependencies;
}

function collectInterfaces(map) {
  const interfaces = [];
  for (const file of asArray(map.files)) {
    for (const item of asArray(file.interfaces_touched)) {
      interfaces.push({ owner: file.path, value: item });
    }
  }
  for (const component of asArray(map.components)) {
    for (const item of asArray(component.interfaces)) {
      interfaces.push({ owner: component.id, value: item });
    }
  }
  return interfaces;
}

function filesForComponent(map, componentId) {
  return asArray(map.files).filter((file) => file.component_id === componentId);
}

function componentGapSummaries(component, indexes) {
  const gaps = new Set(asArray(component.gaps));
  for (const filePath of asArray(component.source_files)) {
    const file = indexes.filesByPath.get(filePath);
    asArray(file?.gap_refs).forEach((gapId) => gaps.add(gapId));
  }
  return [...gaps].map((gapId) => {
    const gap = indexes.gapsById.get(gapId);
    return gap ? `${gapId}: ${gap.summary}` : gapId;
  });
}

function buildMarkdown(map, mermaid) {
  const indexes = buildIndexes(map);
  const components = asArray(map.components).toSorted(sortByIdOrPath);
  const files = asArray(map.files).toSorted(sortByIdOrPath);
  const gaps = openGaps(map).toSorted(sortByIdOrPath);
  const dependencies = collectFileDependencies(map);
  const interfaces = collectInterfaces(map);
  const tests = files.filter((file) => file.classification === "test" || asArray(file.tests).length > 0);
  const unknownFiles = files.filter((file) => file.classification === "unknown");
  const dataStores = components.flatMap((component) =>
    asArray(component.data_stores).map((store) => ({ component: component.id, store }))
  );

  const lines = [
    "# SEAL Map",
    "",
    "## Summary",
    "",
    table(
      ["Metric", "Value"],
      [
        ["Sources", asArray(map.sources).length],
        ["Components", components.length],
        ["Files", files.length],
        ["Dependencies", dependencies.length],
        ["Interfaces", interfaces.length],
        ["Data stores", dataStores.length],
        ["Tests", tests.length],
        ["Open gaps", gaps.length],
        ["Unknown files", unknownFiles.length]
      ]
    ),
    "",
    "## Component Map",
    "",
    table(
      ["Component", "Authority", "Confidence", "Files", "Tests", "Interfaces", "Dependencies", "Gaps", "Next action"],
      components.map((component) => {
        const ownedFiles = filesForComponent(map, component.id);
        const componentTests = new Set(asArray(component.tests));
        ownedFiles.filter((file) => file.classification === "test").forEach((file) => componentTests.add(file.path));
        return [
          `${component.id} - ${component.name}`,
          joinList(component.source_refs),
          component.confidence ?? "unknown",
          ownedFiles.length || asArray(component.source_files).length,
          componentTests.size,
          joinList(component.interfaces),
          asArray(component.dependencies).length,
          joinList(componentGapSummaries(component, indexes)),
          component.next_step ?? "none"
        ];
      })
    ),
    "",
    "## Files By Component",
    ""
  ];

  for (const component of components) {
    const ownedFiles = filesForComponent(map, component.id);
    lines.push(`### ${component.id} - ${component.name}`, "");
    lines.push(table(
      ["File", "Classification", "Role", "Entrypoint", "Proof", "Gaps", "Sources"],
      ownedFiles.map((file) => [
        file.path,
        file.classification,
        file.role ?? "none",
        file.entrypoint === true ? "yes" : "no",
        file.proof_status ?? "unknown",
        joinList(file.gap_refs),
        joinList(file.source_refs)
      ])
    ));
    lines.push("");
  }

  const unassignedFiles = files.filter((file) => !indexes.componentsById.has(file.component_id));
  if (unassignedFiles.length > 0) {
    lines.push("### Unassigned", "");
    lines.push(table(
      ["File", "Classification", "Role", "Proof", "Gaps"],
      unassignedFiles.map((file) => [
        file.path,
        file.classification,
        file.role ?? "none",
        file.proof_status ?? "unknown",
        joinList(file.gap_refs)
      ])
    ));
    lines.push("");
  }

  lines.push(
    "## Dependencies",
    "",
    dependencies.length === 0
      ? "No dependencies were recorded."
      : table(
        ["Owner", "Kind", "Target", "Resolved component", "Authority"],
        dependencies.map((dependency) => {
          const targetPath = dependency.path ?? dependency.specifier ?? dependency.target ?? "unknown";
          const targetFile = indexes.filesByPath.get(targetPath);
          return [
            dependency.ownerId,
            dependency.kind ?? "unknown",
            targetPath,
            targetFile?.component_id ?? "external_or_unresolved",
            dependency.inferred === true ? "inferred" : "observed"
          ];
        })
      ),
    "",
    "## Interfaces And Data Stores",
    "",
    interfaces.length === 0 && dataStores.length === 0
      ? "No interfaces or data stores were recorded."
      : table(
        ["Owner", "Kind", "Value"],
        [
          ...interfaces.map((item) => [item.owner, "interface", item.value]),
          ...dataStores.map((item) => [item.component, "data_store", item.store])
        ]
      ),
    "",
    "## Tests And Proof Links",
    "",
    tests.length === 0
      ? "No tests were recorded."
      : table(
        ["Test or covered file", "Component", "Classification", "Proof", "Gaps"],
        tests.map((file) => [
          file.path,
          file.component_id ?? "unassigned",
          file.classification,
          file.proof_status ?? "unknown",
          joinList(file.gap_refs)
        ])
      ),
    "",
    "## Unknowns And Gaps",
    "",
    gaps.length === 0 && unknownFiles.length === 0
      ? "No open gaps or unknown files were recorded."
      : table(
        ["Gap or file", "Status", "Summary", "Reason", "Next step", "Sources"],
        [
          ...gaps.map((gap) => [
            gap.id,
            gap.status ?? "open",
            gap.summary,
            gap.reason ?? "none",
            gap.next_step ?? "none",
            joinList(gap.source_refs)
          ]),
          ...unknownFiles
            .filter((file) => asArray(file.gap_refs).length === 0)
            .map((file) => [
              file.path,
              "unknown_file",
              file.purpose ?? "File could not be classified.",
              file.reason ?? "unknown classification",
              file.next_step ?? "inspect file",
              joinList(file.source_refs)
            ])
        ]
      ),
    "",
    "## Sources",
    "",
    table(
      ["Source", "Kind", "Path", "Authority"],
      asArray(map.sources).map((source) => [
        source.id,
        source.kind,
        source.path ?? "none",
        source.authority ?? "unknown"
      ])
    ),
    "",
    "## Mermaid",
    "",
    "```mermaid",
    mermaid.trimEnd(),
    "```",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function buildMermaid(map) {
  const indexes = buildIndexes(map);
  const components = asArray(map.components).toSorted(sortByIdOrPath);
  const dependencies = collectFileDependencies(map);
  const gaps = openGaps(map).toSorted(sortByIdOrPath);
  const lines = ["flowchart LR"];

  for (const component of components) {
    lines.push(`  ${mermaidId("cmp", component.id)}["${mermaidLabel(component.name ?? component.id)}"]`);
  }

  const externalNodes = new Set();
  const edgeKeys = new Set();
  for (const dependency of dependencies) {
    const sourceComponentId = dependency.ownerComponentId;
    if (!sourceComponentId || !indexes.componentsById.has(sourceComponentId)) {
      continue;
    }

    const targetPath = dependency.path ?? dependency.specifier ?? dependency.target;
    const targetFile = indexes.filesByPath.get(targetPath);
    const sourceNode = mermaidId("cmp", sourceComponentId);
    let targetNode;
    let label = dependency.kind ?? "depends";

    if (targetFile?.component_id && indexes.componentsById.has(targetFile.component_id)) {
      targetNode = mermaidId("cmp", targetFile.component_id);
    } else {
      const externalLabel = targetPath ?? "unresolved";
      targetNode = mermaidId("ext", externalLabel);
      if (!externalNodes.has(targetNode)) {
        lines.push(`  ${targetNode}["${mermaidLabel(externalLabel)}"]`);
        externalNodes.add(targetNode);
      }
      label = dependency.kind === "external_package" ? "external" : label;
    }

    const key = `${sourceNode}->${targetNode}:${label}`;
    if (sourceNode !== targetNode && !edgeKeys.has(key)) {
      lines.push(`  ${sourceNode} -->|"${mermaidLabel(label)}"| ${targetNode}`);
      edgeKeys.add(key);
    }
  }

  for (const gap of gaps) {
    const gapNode = mermaidId("gap", gap.id);
    lines.push(`  ${gapNode}["${mermaidLabel(gap.id)}"]`);
    lines.push(`  class ${gapNode} gap`);
    const linkedFile = asArray(map.files).find((file) => asArray(file.gap_refs).includes(gap.id));
    const linkedComponentId = linkedFile?.component_id ?? asArray(map.components).find((component) =>
      asArray(component.gaps).includes(gap.id)
    )?.id;
    if (linkedComponentId && indexes.componentsById.has(linkedComponentId)) {
      lines.push(`  ${mermaidId("cmp", linkedComponentId)} -.->|"gap"| ${gapNode}`);
    }
  }

  lines.push("  classDef gap fill:#fff6d6,stroke:#b7791f,color:#4a3410");
  return `${lines.join("\n")}\n`;
}

export function createMapViews(map) {
  const mermaid = buildMermaid(map);
  const markdown = buildMarkdown(map, mermaid);
  return {
    markdown,
    mermaid,
    summary: {
      components: asArray(map.components).length,
      files: asArray(map.files).length,
      gaps: openGaps(map).length,
      dependencies: collectFileDependencies(map).length,
      interfaces: collectInterfaces(map).length
    }
  };
}

export async function writeMapViews(rootDir) {
  const mapPath = path.join(rootDir, ".seal", "map.yaml");
  const map = await parseYamlArtifact(mapPath);
  const schemaResult = await validateArtifact("map", map);
  if (!schemaResult.valid) {
    throw new Error(`Cannot render invalid .seal/map.yaml: ${JSON.stringify(schemaResult.errors)}`);
  }

  const referenceResult = validateArtifactReferences({ map });
  if (!referenceResult.valid) {
    throw new Error(`Cannot render .seal/map.yaml with invalid references: ${JSON.stringify(referenceResult.errors)}`);
  }

  const views = createMapViews(map);
  const reportsDir = path.join(rootDir, ".seal", "reports");
  await mkdir(reportsDir, { recursive: true });
  const markdownPath = path.join(reportsDir, "map.md");
  const mermaidPath = path.join(reportsDir, "map.mmd");
  await writeFile(markdownPath, views.markdown, "utf8");
  await writeFile(mermaidPath, views.mermaid, "utf8");
  return { ...views, markdownPath, mermaidPath };
}
