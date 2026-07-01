export const DEFAULT_RIGOR_PROFILE = "standard";

const PROFILE_ORDER = ["explore", "standard", "launch", "mission-critical"];

export const RIGOR_PROFILES = Object.freeze({
  explore: Object.freeze({
    id: "explore",
    label: "Explore",
    summary: "Early discovery mode: keep unknowns visible and avoid launch claims.",
    prompt_focus: "Find sources, assumptions, open questions, and the smallest useful proof.",
    required_artifacts: ["map"],
    evidence: "Evidence may be partial, but failed, stale, inferred, and missing evidence must stay visible.",
    approvals: "No approval is required; record who can answer open product questions.",
    launch_gates: "Advisory only. Do not represent explore output as launch-ready.",
    enforcement: {
      missingImpact: "warn",
      missingEvidence: "warn",
      staleEvidence: "warn",
      acceptedGaps: "warn",
      approval: "warn",
    },
  }),
  standard: Object.freeze({
    id: "standard",
    label: "Standard",
    summary: "Default delivery mode: map the work, link proof, and keep launch cautions visible.",
    prompt_focus: "Collect enough intent, impact, evidence, and source authority to make ordinary delivery decisions.",
    required_artifacts: ["map", "proof", "evidence"],
    evidence: "Claims need linked evidence or explicit proof gaps. Failed evidence blocks proof; stale evidence is a visible caution.",
    approvals: "Approvals are required only when impact records or launch gates ask for them.",
    launch_gates: "Existing hard gates decide launch status; cautions remain visible to the owner.",
    enforcement: {
      missingImpact: "warn",
      missingEvidence: "blocked",
      staleEvidence: "warn",
      acceptedGaps: "warn",
      approval: "blocked",
    },
  }),
  launch: Object.freeze({
    id: "launch",
    label: "Launch",
    summary: "Release-readiness mode: require impact records, proof coverage, and launch-owner review.",
    prompt_focus: "Resolve launch blockers, prove changed behavior, and make the approval path explicit.",
    required_artifacts: ["map", "impact", "proof", "evidence", "launch-readiness"],
    evidence: "Current proof is expected for launch claims. Failed evidence and open proof obligations block launch.",
    approvals: "Launch-owner approval must be recorded when release risk or impact records require it.",
    launch_gates: "Open impact records, missing proof, pending approvals, and unmapped launch files block launch.",
    enforcement: {
      missingImpact: "blocked",
      missingEvidence: "blocked",
      staleEvidence: "warn",
      acceptedGaps: "warn",
      approval: "blocked",
    },
  }),
  "mission-critical": Object.freeze({
    id: "mission-critical",
    label: "Mission-critical",
    summary: "Opt-in high-assurance mode: require current evidence, independent approval, and no accepted proof gaps.",
    prompt_focus: "Treat uncertainty as launch-blocking until current execution evidence and independent approval exist.",
    required_artifacts: ["map", "impact", "proof", "evidence", "launch-readiness", "independent-approval"],
    evidence: "Evidence must be current and passed. Failed, stale, incomplete, missing, and accepted-gap evidence blocks launch.",
    approvals: "Independent approval evidence is required before launch.",
    launch_gates: "Every unresolved unknown, stale proof, accepted gap, and pending approval blocks launch.",
    enforcement: {
      missingImpact: "blocked",
      missingEvidence: "blocked",
      staleEvidence: "blocked",
      acceptedGaps: "blocked",
      approval: "blocked",
    },
  }),
});

const EXPLICIT_PROFILE_PATTERNS = Object.freeze([
  ["mission-critical", /\b(mission[- ]critical|safety[- ]critical|life[- ]safety|regulated medical)\b/i],
  ["launch", /\b(launch profile|release profile|ship profile|fly profile)\b/i],
  ["explore", /\b(explore profile|discovery profile|exploration profile)\b/i],
  ["standard", /\b(standard profile|default profile)\b/i],
]);

function cloneProfile(profile) {
  return {
    ...profile,
    required_artifacts: [...profile.required_artifacts],
    enforcement: { ...profile.enforcement },
  };
}

export function normalizeRigorProfile(value = DEFAULT_RIGOR_PROFILE) {
  const profile = String(value || DEFAULT_RIGOR_PROFILE).trim().toLowerCase();
  if (RIGOR_PROFILES[profile]) {
    return profile;
  }
  throw new Error(`Unknown SEAL rigor profile: ${value}. Expected one of: ${PROFILE_ORDER.join(", ")}.`);
}

export function getRigorProfilePolicy(value = DEFAULT_RIGOR_PROFILE) {
  return cloneProfile(RIGOR_PROFILES[normalizeRigorProfile(value)]);
}

export function listRigorProfiles() {
  return PROFILE_ORDER.map((id) => getRigorProfilePolicy(id));
}

export function profileFromText(text = "") {
  for (const [profile, pattern] of EXPLICIT_PROFILE_PATTERNS) {
    if (pattern.test(text)) {
      return profile;
    }
  }
  return undefined;
}

export function severityAtLeast(profileId, minimumId) {
  return PROFILE_ORDER.indexOf(normalizeRigorProfile(profileId)) >= PROFILE_ORDER.indexOf(normalizeRigorProfile(minimumId));
}

export function profileQuestionsForRoute(profileId, routeKind = "default") {
  const profile = normalizeRigorProfile(profileId);
  if (profile === "explore") {
    return ["What is still unknown?", "Which source would make this less speculative?"];
  }
  if (profile === "launch") {
    return ["What changed since the last accepted proof?", "Who owns the launch approval?"];
  }
  if (profile === "mission-critical") {
    return ["What current execution evidence proves this?", "Who can independently approve this risk?"];
  }
  if (routeKind === "proof") {
    return ["Which claim has the weakest evidence?"];
  }
  return [];
}

export function detectEscalationRecommendations({ profile = DEFAULT_RIGOR_PROFILE, text = "", map, impacts = [], proof } = {}) {
  const selected = normalizeRigorProfile(profile);
  const lower = String(text).toLowerCase();
  const impactList = Array.isArray(impacts) ? impacts : [];
  const recommendations = [];
  const highConsequenceText = /\b(safety|money|payment|health|medical|security|privacy|compliance|regulated|data loss|irreversible)\b/.test(lower);
  const highRiskRecords = [
    ...(Array.isArray(map?.risks) ? map.risks : []),
    ...(Array.isArray(map?.assumptions) ? map.assumptions : []),
    ...(Array.isArray(proof?.gaps) ? proof.gaps : []),
    ...impactList.flatMap((impact) => [
      ...(Array.isArray(impact.gaps) ? impact.gaps : []),
      ...(Array.isArray(impact.approval_needed) ? impact.approval_needed : []),
    ]),
  ].filter((record) => record.risk === "high" || record.launch_impact === "high" || record.severity === "blocker");

  if (!severityAtLeast(selected, "launch") && (highConsequenceText || highRiskRecords.length > 0)) {
    recommendations.push({
      id: "rigor.escalate.launch",
      target_profile: "launch",
      summary: "High-consequence language or high-risk artifacts are visible; consider the launch profile before release decisions.",
    });
  }

  if (selected !== "mission-critical" && /\b(mission[- ]critical|safety[- ]critical|life[- ]safety|regulated medical)\b/i.test(text)) {
    recommendations.push({
      id: "rigor.escalate.mission-critical",
      target_profile: "mission-critical",
      summary: "Mission-critical language is explicit; use the mission-critical profile if this is the intended assurance level.",
    });
  }

  return recommendations;
}
