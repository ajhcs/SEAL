import path from "node:path";
import { parseYamlArtifact } from "../artifacts/schema-registry.mjs";
import { createArtifactStore } from "../artifacts/store.mjs";
import { createDebtRegisterFromMap } from "../debt/register.mjs";
import { createProofGapReport } from "../proof/gap-report.mjs";

const impactRank = Object.freeze({ high: 0, medium: 1, low: 2 });
const confidenceRank = Object.freeze({ high: 0, medium: 1, low: 2 });

function asList(values) {
  return Array.isArray(values) ? values : [];
}

function sourceRefs(record) {
  return asList(record?.source_refs);
}

function confidenceLabel(value) {
  if (typeof value !== "number") {
    return "medium";
  }
  if (value >= 0.75) {
    return "high";
  }
  if (value >= 0.5) {
    return "medium";
  }
  return "low";
}

function item({ category, title, launchImpact, confidence, sourceRefs = [], gapRefs = [], nextStep, reason }) {
  return {
    category,
    title,
    launchImpact,
    confidence,
    sourceRefs: [...new Set(sourceRefs)].filter(Boolean).sort(),
    gapRefs: [...new Set(gapRefs)].filter(Boolean).sort(),
    nextStep,
    reason
  };
}

function gapItems(map) {
  return asList(map?.gaps).map((gap) => {
    const category = gap.id?.includes("requirements") || gap.id?.includes("no-requirements")
      ? "missing_requirements"
      : gap.id?.includes("test") || gap.id?.includes("proof")
        ? "unproven_claims"
        : gap.id?.includes("component") || gap.id?.includes("unknown-file")
          ? "unclear_interfaces"
          : "launch_blockers";
    return item({
      category,
      title: gap.summary,
      launchImpact: category === "launch_blockers" || category === "missing_requirements" ? "high" : "medium",
      confidence: confidenceLabel(gap.confidence),
      sourceRefs: sourceRefs(gap),
      gapRefs: [gap.id],
      reason: gap.reason,
      nextStep: gap.next_step ?? "Review this gap and either close it with evidence or keep it visible."
    });
  });
}

function missingPlanStructureItems(map) {
  const items = [];
  const sourceRefs = asList(map?.sources).map((source) => source.id);

  if (asList(map?.requirements).length === 0) {
    items.push(item({
      category: "missing_requirements",
      title: "No reviewed requirements are present in the map.",
      launchImpact: "high",
      confidence: "high",
      sourceRefs,
      nextStep: "Add source-backed requirements, constraints, or acceptance criteria before launch planning.",
      reason: "Launch scope cannot be checked without explicit requirements."
    }));
  }

  if (asList(map?.launch_gates).length === 0) {
    items.push(item({
      category: "launch_blockers",
      title: "No launch gates are present in the map.",
      launchImpact: "high",
      confidence: "high",
      sourceRefs,
      nextStep: "Add pass/fail launch gates for validation, rollback, approval, and proof readiness.",
      reason: "Launch readiness needs explicit conditions before SEAL can call a launch safe."
    }));
  }

  if (asList(map?.risks).length === 0) {
    items.push(item({
      category: "unmanaged_risks",
      title: "No risks are recorded yet.",
      launchImpact: "medium",
      confidence: "medium",
      sourceRefs,
      nextStep: "Record known technical, operational, user, security, or launch risks with mitigation evidence.",
      reason: "A clean launch report needs visible risks or a sourced statement that no known risks apply."
    }));
  }

  return items;
}

function unclearInterfaceItems(map) {
  const components = asList(map?.components);
  const interfaceCount = components.reduce((count, component) => count + asList(component.interfaces).length, 0);
  const dependencyCount = components.reduce((count, component) => count + asList(component.dependencies).length, 0);
  const sourceRefs = asList(map?.sources).map((source) => source.id);

  if (components.length === 0 || interfaceCount > 0 || dependencyCount > 0) {
    return [];
  }

  return [item({
    category: "unclear_interfaces",
    title: "No component interfaces or dependencies are recorded yet.",
    launchImpact: "medium",
    confidence: "medium",
    sourceRefs,
    nextStep: "Review the map and add entrypoints, APIs, data stores, dependencies, or an explicit gap for each unknown interface.",
    reason: "Impact analysis depends on knowing how components connect."
  })];
}

function debtItems(debt) {
  return asList(debt?.records).map((record) => item({
    category: record.type === "missing_requirement"
      ? "missing_requirements"
      : record.type === "missing_evidence" || record.type === "missing_test"
        ? "unproven_claims"
        : record.type === "risky_dependency"
          ? "launch_blockers"
          : "unclear_interfaces",
    title: record.summary,
    launchImpact: record.severity === "blocker" || record.type === "risky_dependency" || record.type === "missing_requirement" ? "high" : "medium",
    confidence: confidenceLabel(record.confidence),
    sourceRefs: sourceRefs(record),
    gapRefs: asList(record.gap_refs),
    reason: record.reason,
    nextStep: record.next_action ?? "Review this debt record and resolve it or keep the gap explicit."
  }));
}

function proofItems(proof, evidenceIndex) {
  if (!proof || !evidenceIndex) {
    return [item({
      category: "unproven_claims",
      title: "Proof claims or evidence index are not available for review.",
      launchImpact: "high",
      confidence: "high",
      nextStep: "Create .seal/proof.yaml and .seal/evidence/index.yaml, then run seal-proof-report.",
      reason: "Launch claims need linked evidence or explicit gaps."
    })];
  }

  const report = createProofGapReport({ proof, evidenceIndex });
  return report.claims
    .filter((claim) => claim.status !== "proven")
    .map((claim) => item({
      category: claim.status === "failed" || claim.status === "invalid" ? "launch_blockers" : "unproven_claims",
      title: `${claim.claim.id}: ${claim.reasons[0] ?? claim.claim.statement}`,
      launchImpact: ["invalid", "failed", "blocked"].includes(claim.status) ? "high" : "medium",
      confidence: confidenceLabel(claim.claim.confidence),
      sourceRefs: sourceRefs(claim.claim),
      gapRefs: asList(claim.claim.gap_refs),
      reason: claim.claim.plain_language ?? claim.claim.statement,
      nextStep: claim.nextAction
    }));
}

function dedupeItems(items) {
  const byKey = new Map();
  for (const reviewItem of items) {
    const key = `${reviewItem.category}:${reviewItem.title}:${reviewItem.gapRefs.join(",")}`;
    if (!byKey.has(key)) {
      byKey.set(key, reviewItem);
    }
  }
  return [...byKey.values()];
}

function sortItems(items) {
  return [...items].sort((left, right) => (
    impactRank[left.launchImpact] - impactRank[right.launchImpact]
    || confidenceRank[left.confidence] - confidenceRank[right.confidence]
    || left.category.localeCompare(right.category)
    || left.title.localeCompare(right.title)
  ));
}

function displayCategory(category) {
  return category.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function sourceLine(reviewItem) {
  const sources = reviewItem.sourceRefs.length > 0 ? reviewItem.sourceRefs.join(", ") : "source gap";
  const gaps = reviewItem.gapRefs.length > 0 ? reviewItem.gapRefs.join(", ") : "none";
  return `Sources: ${sources}; gaps: ${gaps}.`;
}

function importReport(map) {
  const mappedCounts = {
    requirements: asList(map?.requirements).length,
    risks: asList(map?.risks).length,
    assumptions: asList(map?.assumptions).length,
    launchGates: asList(map?.launch_gates).length,
    traceLinks: asList(map?.trace_links).length
  };
  const mappedDirectly = Object.entries(mappedCounts)
    .map(([label, count]) => `${count} ${label.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`)}`)
    .join(", ");
  const inferredItems = [
    ...asList(map?.requirements),
    ...asList(map?.risks),
    ...asList(map?.assumptions),
    ...asList(map?.launch_gates),
    ...asList(map?.trace_links)
  ].filter((record) => record.authority_state === "inferred").length;
  const unresolvedGaps = asList(map?.gaps).filter((gap) => gap.status !== "closed");
  const sourceLabels = asList(map?.sources)
    .map((source) => source.label ?? source.description ?? source.id)
    .filter(Boolean)
    .join(", ");

  return {
    mappedDirectly,
    inferredItems,
    unresolvedItems: unresolvedGaps.length,
    unresolvedGapIds: unresolvedGaps.map((gap) => gap.id).filter(Boolean).join(", ") || "none",
    sourceLabels: sourceLabels || "no source labels"
  };
}

function renderItems(lines, items) {
  if (items.length === 0) {
    lines.push("- No items found.");
    return;
  }

  for (const reviewItem of items) {
    lines.push(`- **${reviewItem.launchImpact} impact / ${reviewItem.confidence} confidence** - ${reviewItem.title}`);
    lines.push(`  Next: ${reviewItem.nextStep}`);
    lines.push(`  ${sourceLine(reviewItem)}`);
  }
}

function renderMarkdown(review) {
  const lines = [
    "# SEAL Ingestion Gap Review",
    "",
    "This review is generated from current SEAL artifacts. It names what is missing or uncertain before launch work depends on it.",
    "",
    "## Summary",
    "",
    `- Ranked gaps: ${review.items.length}`,
    `- High launch impact: ${review.items.filter((item) => item.launchImpact === "high").length}`,
    `- Source-backed items: ${review.items.filter((item) => item.sourceRefs.length > 0).length}`,
    "",
    "## Import Report",
    "",
    `- Mapped directly: ${review.importReport.mappedDirectly}.`,
    `- Inferred items: ${review.importReport.inferredItems} records need review before approval.`,
    `- Unresolved items: ${review.importReport.unresolvedItems} open gaps (${review.importReport.unresolvedGapIds}).`,
    `- Source plan files: ${review.importReport.sourceLabels}.`,
    "",
    "## Ranked Gaps",
    ""
  ];

  renderItems(lines, review.items.slice(0, 10));

  for (const category of ["missing_requirements", "unclear_interfaces", "unproven_claims", "unmanaged_risks", "launch_blockers"]) {
    lines.push("", `## ${displayCategory(category)}`, "");
    renderItems(lines, review.items.filter((reviewItem) => reviewItem.category === category));
  }

  lines.push("", "## Source Authority", "");
  const sources = asList(review.map?.sources);
  if (sources.length === 0) {
    lines.push("- No source authority records are present.");
  } else {
    for (const source of sources) {
      lines.push(`- ${source.id}: ${source.label ?? source.kind ?? "source"} (${source.authority_state ?? "unknown authority"})`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function createIngestionGapReview({ map, proof, evidenceIndex, debt }) {
  const effectiveDebt = debt ?? (map ? createDebtRegisterFromMap(map) : undefined);
  const items = sortItems(dedupeItems([
    ...missingPlanStructureItems(map),
    ...gapItems(map),
    ...unclearInterfaceItems(map),
    ...debtItems(effectiveDebt),
    ...proofItems(proof, evidenceIndex)
  ]));

  const review = {
    map,
    items,
    importReport: importReport(map),
    counts: items.reduce((acc, reviewItem) => {
      acc[reviewItem.category] = (acc[reviewItem.category] ?? 0) + 1;
      return acc;
    }, {})
  };

  return { ...review, markdown: renderMarkdown(review) };
}

export async function writeIngestionGapReview(root, artifacts) {
  const store = createArtifactStore(root);
  const map = artifacts?.map ?? await parseYamlArtifact(store.pathFor("map"));
  const artifactSet = artifacts ?? (await store.readCanonicalSet({ mode: "diagnostic" })).artifactSet;
  const proof = artifactSet.proof;
  const evidenceIndex = artifactSet.evidenceIndex;
  const debt = artifactSet.debt;
  const review = createIngestionGapReview({ map, proof, evidenceIndex, debt });
  const { filePath: outputPath } = await store.writeDerived("gapReview", review.markdown, {
    reason: "write_ingestion_gap_review"
  });

  return { review, outputPath };
}
