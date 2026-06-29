function idPart(value) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "item";
}

function compactText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function confidenceForHeading(heading) {
  return heading ? 0.75 : 0.55;
}

function classifySection(title) {
  const normalized = title.toLowerCase();
  if (/\b(acceptance|success criteria|done|verify|validation)\b/.test(normalized)) {
    return "acceptance_criterion";
  }
  if (/\b(constraint|limit|must not|never)\b/.test(normalized)) {
    return "constraint";
  }
  if (/\b(milestone|timeline|phase|release)\b/.test(normalized)) {
    return "milestone";
  }
  if (/\b(decision|decisions|chosen|approach)\b/.test(normalized)) {
    return "decision";
  }
  if (/\b(requirement|goal|objective|feature|scope)\b/.test(normalized)) {
    return "requirement";
  }
  if (/\b(risk|hazard|failure|concern)\b/.test(normalized)) {
    return "risk";
  }
  if (/\b(assumption|unknown|open question)\b/.test(normalized)) {
    return "assumption";
  }
  if (/\b(launch|gate|readiness|ship)\b/.test(normalized)) {
    return "launch_gate";
  }
  return "requirement";
}

function classifyBullet(text, sectionKind) {
  const normalized = text.toLowerCase();
  if (/\b(risk|hazard|could fail|failure|danger)\b/.test(normalized)) {
    return "risk";
  }
  if (/\b(assume|assumption|unknown|open question|needs review|unclear)\b/.test(normalized)) {
    return "assumption";
  }
  if (/^(acceptance|success criteria|done when|verify):/.test(normalized)) {
    return "acceptance_criterion";
  }
  if (/\b(launch|gate|ready to ship|ship when|release when)\b/.test(normalized)) {
    return "launch_gate";
  }
  if (/\b(acceptance|passes when|done when|must prove|verify|validation)\b/.test(normalized)) {
    return "acceptance_criterion";
  }
  if (/\b(must not|never|constraint|limit|without)\b/.test(normalized)) {
    return "constraint";
  }
  return sectionKind;
}

function extractBulletText(line) {
  const match = line.match(/^\s*(?:[-*+]|\d+\.)\s+(.+)$/);
  return match ? compactText(match[1]) : null;
}

function baseRecord({ id, summary, sourceId, confidence }) {
  return {
    id,
    summary,
    source_refs: [sourceId],
    authority_state: "inferred",
    approval_state: "pending",
    confidence,
    plain_language: summary,
    next_step: "Review this extracted plan item and either approve it, refine it, or keep it as a visible gap."
  };
}

function makeUniqueId(usedIds, prefix, text) {
  const base = `${prefix}.${idPart(text).slice(0, 48)}`;
  let id = base;
  let counter = 2;
  while (usedIds.has(id)) {
    id = `${base}-${counter}`;
    counter += 1;
  }
  usedIds.add(id);
  return id;
}

function pushExtracted(collections, kind, text, context) {
  const { sourceId, currentHeading, usedIds } = context;
  const confidence = confidenceForHeading(currentHeading);
  if (kind === "risk") {
    const id = makeUniqueId(usedIds, "risk", text);
    collections.risks.push({
      ...baseRecord({ id, summary: text, sourceId, confidence }),
      mitigation: "Mitigation has not been proven yet.",
      next_step: "Confirm the risk, add mitigation evidence, or close it as not applicable."
    });
    return id;
  }

  if (kind === "assumption") {
    const id = makeUniqueId(usedIds, "asm", text);
    collections.assumptions.push({
      ...baseRecord({ id, summary: text, sourceId, confidence }),
      status: "needs_review",
      next_step: "Confirm the assumption with source authority or convert it into an explicit gap."
    });
    return id;
  }

  if (kind === "launch_gate") {
    const id = makeUniqueId(usedIds, "gate", text);
    collections.launch_gates.push({
      ...baseRecord({ id, summary: text, sourceId, confidence }),
      status: "blocked",
      next_step: "Attach proof evidence before treating this gate as launch-ready."
    });
    return id;
  }

  const id = makeUniqueId(usedIds, "req", text);
  collections.requirements.push({
    ...baseRecord({ id, summary: text, sourceId, confidence }),
    kind,
    next_step: "Review this extracted requirement and link it to components, risks, proof claims, and launch gates."
  });
  return id;
}

function createTraceLink(usedIds, sourceId, from_id, to_id, relationship) {
  return {
    id: makeUniqueId(usedIds, "trace", `${from_id}-${relationship}-${to_id}`),
    from_id,
    to_id,
    relationship,
    source_refs: [sourceId],
    authority_state: "inferred",
    approval_state: "pending",
    confidence: 0.55,
    plain_language: `${from_id} is linked to ${to_id} as ${relationship}.`,
    next_step: "Review this inferred trace link before relying on it for launch decisions."
  };
}

function collectHeadingRequirements(markdown, sourceId, collections, usedIds) {
  const lines = markdown.split(/\r?\n/);
  let currentHeading = "";
  let currentKind = "requirement";
  let previousRequirementId = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      currentHeading = compactText(headingMatch[2]);
      currentKind = classifySection(currentHeading);
      if (currentKind === "requirement" && headingMatch[1].length <= 2) {
        previousRequirementId = pushExtracted(collections, "requirement", currentHeading, {
          sourceId,
          currentHeading,
          usedIds
        });
      }
      continue;
    }

    const bulletText = extractBulletText(line);
    if (!bulletText) {
      continue;
    }

    const kind = classifyBullet(bulletText, currentKind);
    const id = pushExtracted(collections, kind, bulletText, { sourceId, currentHeading, usedIds });
    if (previousRequirementId && id !== previousRequirementId && kind !== "requirement") {
      collections.trace_links.push(createTraceLink(usedIds, sourceId, previousRequirementId, id, "informs"));
    }
    if (kind === "requirement") {
      previousRequirementId = id;
    }
  }
}

export function ingestMarkdownPlan(markdown, { sourceId }) {
  const usedIds = new Set();
  const collections = {
    requirements: [],
    risks: [],
    assumptions: [],
    trace_links: [],
    launch_gates: [],
    gaps: []
  };

  collectHeadingRequirements(markdown, sourceId, collections, usedIds);

  if (collections.requirements.length === 0) {
    collections.gaps.push({
      id: "gap.plan-no-requirements",
      summary: "No clear goals, requirements, or acceptance criteria were extracted from the Markdown plan.",
      reason: "SEAL could not find headings or bullets that safely identify planned behavior.",
      source_refs: [sourceId],
      authority_state: "inferred",
      approval_state: "not_required",
      confidence: 0.7,
      status: "open",
      plain_language: "The plan is too sparse for SEAL to identify requirements confidently.",
      next_step: "Add goals, constraints, milestones, or acceptance criteria to the plan."
    });
  }

  if (collections.launch_gates.length === 0) {
    collections.gaps.push({
      id: "gap.plan-no-launch-gates",
      summary: "No launch or readiness gates were extracted from the Markdown plan.",
      reason: "Launch readiness needs explicit pass/fail criteria before SEAL can support a launch report.",
      source_refs: [sourceId],
      authority_state: "inferred",
      approval_state: "not_required",
      confidence: 0.7,
      status: "open",
      plain_language: "The plan does not say what must be true before launch.",
      next_step: "Add launch gates such as validation, evidence, rollback, or user acceptance criteria."
    });
  }

  return collections;
}
