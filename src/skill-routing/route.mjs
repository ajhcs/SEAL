import {
  DEFAULT_RIGOR_PROFILE,
  detectEscalationRecommendations,
  getRigorProfilePolicy,
  profileFromText,
  profileQuestionsForRoute,
} from "../rigor/profiles.mjs";

const BEGINNER_HINTS = [
  "use seal",
  "map this repo",
  "map my repo",
  "what is unknown",
  "tell me what is unknown",
  "help me understand",
  "launch ready",
  "ready to launch"
];

const IMPACT_HINTS = [
  "impact",
  "what changes",
  "what breaks",
  "affected",
  "ripple",
  "proposed change"
];

const PLAN_HINTS = [
  "plan",
  "planning",
  "new feature",
  "feature plan",
  "implementation plan",
  "roadmap",
  "scope",
  "requirements",
  "acceptance criteria"
];

const PROOF_HINTS = [
  "proof",
  "evidence",
  "claim",
  "prove",
  "gate",
  "validate",
  "launch report"
];

const ARTIFACT_HINTS = [
  ".seal/",
  ".seal\\",
  "map.yaml",
  "proof.yaml",
  "impact-",
  "schema",
  "reference integrity",
  "file coverage",
  "validator"
];

function includesAny(text, hints) {
  return hints.some((hint) => text.includes(hint));
}

function withProfile(route, routeKind, profile, explicitProfile, text) {
  return {
    ...route,
    profile: {
      id: profile.id,
      label: profile.label,
      summary: profile.summary,
      prompt_focus: profile.prompt_focus,
      required_artifacts: profile.required_artifacts,
    },
    escalationRecommendations: detectEscalationRecommendations({ profile: profile.id, text }),
    starterQuestions: explicitProfile
      ? [...route.starterQuestions, ...profileQuestionsForRoute(profile.id, routeKind)]
      : route.starterQuestions,
  };
}

export function routeSealRequest(input, options = {}) {
  const text = input.toLowerCase();
  const explicitProfile = options.profile ?? profileFromText(input);
  const profile = getRigorProfilePolicy(explicitProfile ?? DEFAULT_RIGOR_PROFILE);
  const wantsImpact = includesAny(text, IMPACT_HINTS);
  const wantsPlan = includesAny(text, PLAN_HINTS);
  const wantsProof = includesAny(text, PROOF_HINTS);
  const wantsArtifacts = includesAny(text, ARTIFACT_HINTS);
  const beginner = includesAny(text, BEGINNER_HINTS) && !wantsArtifacts;

  if (wantsArtifacts) {
    return withProfile({
      mode: "advanced",
      path: ["inspect-artifacts", "validate-schemas", "validate-references", "report-gaps"],
      askPolicy: "ask only for authority gaps after local artifact inspection",
      plainLabel: "Check whether the SEAL files are valid and connected.",
      starterQuestions: [
        "Do the SEAL files match their expected shape?",
        "Do artifact ids and file paths point to things that exist?",
        "Which missing source authority blocks trust?"
      ]
    }, "artifacts", profile, explicitProfile, input);
  }

  if (wantsPlan && !wantsImpact && !wantsProof) {
    return withProfile({
      mode: beginner ? "beginner" : "guided",
      path: [
        "inspect-context",
        "draft-feature-plan",
        "map-source-authority",
        "identify-impact-questions",
        "define-proof-needs",
        "set-launch-gates",
        "report-gaps"
      ],
      askPolicy: "inspect first, then ask only for missing feature intent or source authority",
      plainLabel: "Turn a new-feature idea into a traceable plan with proof and launch gates.",
      starterQuestions: [
        "Who is this for?",
        "What should change for the user?",
        "What would prove this worked?"
      ]
    }, "plan", profile, explicitProfile, input);
  }

  if (wantsImpact) {
    return withProfile({
      mode: beginner ? "beginner" : "guided",
      path: ["inspect-repo", "update-map", "analyze-impact", "record-proof-needs", "report-gaps"],
      askPolicy: "inspect first, then ask only for missing change intent or source authority",
      plainLabel: "Show what changes and what needs new proof.",
      starterQuestions: [
        "What file, behavior, or decision is changing?",
        "Who is this for?",
        "Can users lose work here?"
      ]
    }, "impact", profile, explicitProfile, input);
  }

  if (wantsProof) {
    return withProfile({
      mode: beginner ? "beginner" : "guided",
      path: ["inspect-map", "collect-claims", "link-evidence", "record-gaps", "validate-launch-gates"],
      askPolicy: "ask only for missing evidence authority or launch decision authority",
      plainLabel: "Show what would prove this worked and what is still missing.",
      starterQuestions: [
        "What are we asking someone to believe?",
        "What would prove this worked?",
        "What evidence is still missing?"
      ]
    }, "proof", profile, explicitProfile, input);
  }

  return withProfile({
    mode: beginner ? "beginner" : "guided",
    path: ["inspect-repo", "initialize-seal", "ingest", "map", "render-unknowns", "validate"],
    askPolicy: "start from local inspection and ask only for facts that cannot be observed",
    plainLabel: "Show what exists, what is unknown, and what blocks launch.",
    starterQuestions: [
      "Who is this for?",
      "What should never happen?",
      "What is missing before this can launch?"
    ]
  }, "default", profile, explicitProfile, input);
}
