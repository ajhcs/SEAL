import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseYamlArtifact } from "../artifacts/schema-registry.mjs";
import { CLAIM_EVIDENCE_TYPES, validateProofTaxonomy } from "./taxonomy.mjs";
import { DEFAULT_RIGOR_PROFILE, getRigorProfilePolicy } from "../rigor/profiles.mjs";

const statusRank = Object.freeze({
  invalid: 0,
  failed: 1,
  blocked: 2,
  stale: 3,
  assumed: 4,
  proven: 5
});

function asList(values) {
  return Array.isArray(values) ? values : [];
}

function summarizeEvidence(evidence) {
  if (!evidence) {
    return "missing evidence record";
  }
  return `${evidence.id} (${evidence.type}, ${evidence.status})`;
}

function summarizeGap(gapId, gapById) {
  const gap = gapById.get(gapId);
  if (!gap) {
    return `${gapId} (missing gap record)`;
  }
  return `${gap.id} (${gap.status}) - ${gap.summary}`;
}

function summarizeObjectRefs(record) {
  const refs = asList(record?.object_refs);
  return refs.length > 0 ? refs.join(", ") : "none";
}

function acceptedEvidenceForClaim(claim, evidence) {
  return asList(CLAIM_EVIDENCE_TYPES[claim.type]).includes(evidence?.type);
}

function classifyClaim(claim, evidenceById, gapById) {
  const evidenceRefs = asList(claim.evidence_refs);
  const gapRefs = asList(claim.gap_refs);
  const linkedEvidence = evidenceRefs.map((id) => evidenceById.get(id)).filter(Boolean);
  const missingEvidence = evidenceRefs.filter((id) => !evidenceById.has(id));
  const unsupportedEvidence = linkedEvidence.filter((evidence) => !acceptedEvidenceForClaim(claim, evidence));
  const failedEvidence = linkedEvidence.filter((evidence) => evidence.status === "failed");
  const staleEvidence = linkedEvidence.filter((evidence) => evidence.status === "stale");
  const incompleteEvidence = linkedEvidence.filter((evidence) => evidence.status === "incomplete");
  const passedEvidence = linkedEvidence.filter((evidence) => evidence.status === "passed" && acceptedEvidenceForClaim(claim, evidence));
  const missingGaps = gapRefs.filter((id) => !gapById.has(id));
  const linkedGaps = gapRefs.map((id) => gapById.get(id)).filter(Boolean);
  const openGaps = linkedGaps.filter((gap) => gap.status === "open");
  const acceptedGaps = linkedGaps.filter((gap) => gap.status === "accepted");

  const reasons = [];
  const nextActions = [];

  if (!CLAIM_EVIDENCE_TYPES[claim.type]) {
    reasons.push(`Unknown claim type: ${claim.type}.`);
    nextActions.push("Change the claim type to a supported proof taxonomy value or extend the taxonomy deliberately.");
    return { status: "invalid", reasons, nextActions };
  }
  if (missingEvidence.length > 0) {
    reasons.push(`Missing evidence records: ${missingEvidence.join(", ")}.`);
    nextActions.push("Create the missing evidence records or move the uncertainty into explicit proof gaps.");
  }
  if (unsupportedEvidence.length > 0) {
    reasons.push(`Unsupported evidence type for ${claim.type}: ${unsupportedEvidence.map((item) => `${item.id}:${item.type}`).join(", ")}.`);
    nextActions.push(`Attach one accepted evidence type: ${CLAIM_EVIDENCE_TYPES[claim.type].join(", ")}.`);
  }
  if (missingGaps.length > 0) {
    reasons.push(`Missing gap records: ${missingGaps.join(", ")}.`);
    nextActions.push("Create the referenced gap records so unsupported proof is visible.");
  }
  if (failedEvidence.length > 0) {
    reasons.push(`Failed evidence is linked: ${failedEvidence.map((item) => item.id).join(", ")}.`);
    nextActions.push("Fix the failing behavior or keep the claim blocked with a visible gap.");
  }
  if (openGaps.length > 0) {
    reasons.push(`Open proof gaps remain: ${openGaps.map((item) => item.id).join(", ")}.`);
    nextActions.push(openGaps[0].next_step ?? "Close, accept, or keep the proof gap visible before launch.");
  }
  if (incompleteEvidence.length > 0) {
    reasons.push(`Incomplete evidence is linked: ${incompleteEvidence.map((item) => item.id).join(", ")}.`);
    nextActions.push("Replace incomplete evidence with command output, test results, inspection notes, or approval evidence.");
  }
  if (staleEvidence.length > 0) {
    reasons.push(`Stale evidence is linked: ${staleEvidence.map((item) => item.id).join(", ")}.`);
    nextActions.push("Refresh stale evidence and record the new captured_at value.");
  }

  if (missingEvidence.length > 0 || unsupportedEvidence.length > 0 || missingGaps.length > 0) {
    return { status: "invalid", reasons, nextActions };
  }
  if (failedEvidence.length > 0) {
    return { status: "failed", reasons, nextActions };
  }
  if (openGaps.length > 0 || incompleteEvidence.length > 0) {
    return { status: "blocked", reasons, nextActions };
  }
  if (staleEvidence.length > 0 && passedEvidence.length === 0) {
    return { status: "stale", reasons, nextActions };
  }
  if (passedEvidence.length > 0 && gapRefs.length === 0) {
    reasons.push(`Current accepted evidence is linked: ${passedEvidence.map((item) => item.id).join(", ")}.`);
    nextActions.push("Keep evidence current when the affected behavior changes.");
    return { status: "proven", reasons, nextActions };
  }
  if (passedEvidence.length > 0 && staleEvidence.length > 0) {
    reasons.push(`A current evidence record exists, but stale evidence should be refreshed or removed: ${staleEvidence.map((item) => item.id).join(", ")}.`);
    nextActions.push("Refresh or retire stale evidence before treating the claim as cleanly launch-ready.");
    return { status: "stale", reasons, nextActions };
  }
  if (acceptedGaps.length > 0) {
    reasons.push(`Accepted proof gaps remain: ${acceptedGaps.map((item) => item.id).join(", ")}.`);
    nextActions.push("Treat this as an explicit assumption until evidence replaces the accepted gap.");
    return { status: "assumed", reasons, nextActions };
  }

  reasons.push("No passed evidence or explicit gap is linked.");
  nextActions.push("Attach accepted evidence or record a visible proof gap.");
  return { status: "blocked", reasons, nextActions };
}

function claimLine(item) {
  return `| ${item.claim.id} | ${item.claim.type} | ${item.status} | ${item.claim.statement} | ${summarizeObjectRefs(item.claim)} | ${asList(item.claim.source_refs).join(", ")} | ${item.evidenceSummary || "none"} | ${item.gapSummary || "none"} | ${item.nextAction} |`;
}

export function createProofGapReport({ proof, evidenceIndex, profile: profileInput } = {}) {
  const profile = getRigorProfilePolicy(profileInput ?? DEFAULT_RIGOR_PROFILE);
  const evidenceById = new Map(asList(evidenceIndex?.evidence).map((evidence) => [evidence.id, evidence]));
  const gapById = new Map(asList(proof?.gaps).map((gap) => [gap.id, gap]));
  const taxonomy = validateProofTaxonomy(proof, evidenceIndex);

  const claims = asList(proof?.claims).map((claim) => {
    const classification = classifyClaim(claim, evidenceById, gapById);
    return {
      claim,
      ...classification,
      evidenceSummary: asList(claim.evidence_refs).map((id) => summarizeEvidence(evidenceById.get(id))).join("; "),
      gapSummary: asList(claim.gap_refs).map((id) => summarizeGap(id, gapById)).join("; "),
      nextAction: classification.nextActions[0] ?? claim.next_step ?? "Review this claim."
    };
  });

  const counts = claims.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  const readiness = claims.length === 0
    ? "blocked"
    : claims.every((item) => item.status === "proven") ? "proven"
      : claims.some((item) => ["invalid", "failed", "blocked"].includes(item.status)) ? "blocked"
        : claims.some((item) => item.status === "stale") ? "stale"
          : "assumed";
  const topGaps = claims
    .filter((item) => statusRank[item.status] < statusRank.proven)
    .sort((a, b) => statusRank[a.status] - statusRank[b.status])
    .slice(0, 5);

  const lines = [
    "# SEAL Proof Gap Report",
    "",
    `Launch proof status: **${readiness}**`,
    "",
    "## Summary",
    "",
    `- Rigor profile: ${profile.label} (${profile.id})`,
    `- Evidence expectation: ${profile.evidence}`,
    `- Total claims: ${claims.length}`,
    `- Proven: ${counts.proven ?? 0}`,
    `- Assumed: ${counts.assumed ?? 0}`,
    `- Stale: ${counts.stale ?? 0}`,
    `- Blocked: ${counts.blocked ?? 0}`,
    `- Failed: ${counts.failed ?? 0}`,
    `- Invalid: ${counts.invalid ?? 0}`,
    "",
    "## Top Proof Gaps",
    ""
  ];

  if (topGaps.length === 0) {
    lines.push("- No proof gaps were found.");
  } else {
    for (const item of topGaps) {
      lines.push(`- **${item.status}** ${item.claim.id}: ${item.reasons[0]} Next: ${item.nextAction}`);
    }
  }

  lines.push(
    "",
    "## Claim Details",
    "",
    "| Claim | Type | Status | Statement | Object refs | Source refs | Evidence refs | Gap refs | Next action |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...claims.map(claimLine)
  );

  if (!taxonomy.valid) {
    lines.push("", "## Taxonomy Issues", "");
    for (const error of taxonomy.errors) {
      lines.push(`- ${error.code}: ${error.message}`);
    }
  }

  return {
    readiness,
    counts,
    claims,
    taxonomy,
    profile,
    markdown: `${lines.join("\n")}\n`
  };
}

export async function writeProofGapReport(root, options = {}) {
  const proof = await parseYamlArtifact(path.join(root, ".seal", "proof.yaml"));
  const evidenceIndex = await parseYamlArtifact(path.join(root, ".seal", "evidence", "index.yaml"));
  const report = createProofGapReport({ proof, evidenceIndex, profile: options.profile });
  const reportsRoot = path.join(root, ".seal", "reports");
  const outputPath = path.join(reportsRoot, "proof-gaps.md");

  await mkdir(reportsRoot, { recursive: true });
  await writeFile(outputPath, report.markdown, "utf8");

  return { report, outputPath };
}
