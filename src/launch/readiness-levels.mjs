const levels = Object.freeze({
  0: {
    id: "SRL-0",
    label: "Fix foundations",
    summary: "SEAL found a hard failure or too little valid artifact coverage to reason about launch.",
  },
  1: {
    id: "SRL-1",
    label: "Repo mapped",
    summary: "SEAL can see the repo shape, but impact and proof are still thin or absent.",
  },
  2: {
    id: "SRL-2",
    label: "Impact scoped",
    summary: "SEAL can see mapped work and launch impact areas, but proof is not strong enough yet.",
  },
  3: {
    id: "SRL-3",
    label: "Proof developing",
    summary: "SEAL can see proof work, but blockers or unknowns still prevent launch confidence.",
  },
  4: {
    id: "SRL-4",
    label: "Ready with cautions",
    summary: "SEAL found enough evidence to proceed only if the launch owner accepts the visible cautions.",
  },
  5: {
    id: "SRL-5",
    label: "Launch ready",
    summary: "SEAL found mapped scope, proof evidence, and passing launch gates.",
  },
});

function countProofClaims(proof) {
  return Object.values(proof?.counts ?? {}).reduce((total, count) => total + count, 0);
}

function mapHasCoverage(map) {
  return (map?.components ?? 0) > 0 || (map?.files ?? 0) > 0;
}

function impactHasScope(impact) {
  return (impact?.records ?? 0) > 0
    || (impact?.open_proof_obligations ?? 0) > 0
    || (impact?.pending_approvals ?? 0) > 0
    || (impact?.unknown_affected ?? 0) > 0
    || (impact?.open_gaps ?? 0) > 0;
}

function proofHasSignal(proof) {
  return proof?.readiness !== "missing" || countProofClaims(proof) > 0;
}

function driver(text, artifact, ref) {
  return { text, artifact_refs: [{ artifact, ref, reason: text }] };
}

export function evaluateReadinessLevel({ validation, map, impact, proof, policy }) {
  const drivers = [];
  const validationFailed = validation && validation.valid === false;

  if (validationFailed || policy?.overall === "fail") {
    drivers.push(driver("A hard validation, reference, coverage, or proof failure is active.", "gate.policy", policy?.overall ?? "fail"));
    return {
      ...levels[0],
      level: 0,
      drivers,
      next_action: "Fix the hard failure, then rerun validation and regenerate the launch report.",
    };
  }

  if (!mapHasCoverage(map)) {
    drivers.push(driver("MAP does not yet show repo components or files.", "map", "summary"));
    return {
      ...levels[0],
      level: 0,
      drivers,
      next_action: "Run MAP and record the repo components/files before judging launch readiness.",
    };
  }

  if (policy?.overall === "pass") {
    drivers.push(driver("Gate policy is passing.", "gate.policy", "pass"));
    drivers.push(driver("MAP coverage and PROVE evidence are visible.", "map", "summary"));
    return {
      ...levels[5],
      level: 5,
      drivers,
      next_action: "Keep the evidence attached to the release handoff.",
    };
  }

  if (policy?.overall === "warn") {
    drivers.push(driver("Gate policy has warnings but no blockers, unknowns, or failures.", "gate.policy", "warn"));
    return {
      ...levels[4],
      level: 4,
      drivers,
      next_action: "Have the launch owner accept the cautions or replace them with stronger evidence.",
    };
  }

  if (proofHasSignal(proof)) {
    drivers.push(driver("PROVE has claims or evidence, but launch gates still block or need inspection.", "proof", "claims"));
    return {
      ...levels[3],
      level: 3,
      drivers,
      next_action: "Resolve the listed blockers or unknowns before treating the work as launch-ready.",
    };
  }

  if (impactHasScope(impact) || (map?.gaps ?? 0) > 0) {
    drivers.push(driver("IMPACT or MAP has visible scope that still needs proof.", "impact", "records"));
    return {
      ...levels[2],
      level: 2,
      drivers,
      next_action: "Add proof claims and evidence for the scoped launch impact.",
    };
  }

  drivers.push(driver("MAP has repo coverage, but later SEAL artifacts are still sparse.", "map", "summary"));
  return {
    ...levels[1],
    level: 1,
    drivers,
    next_action: "Run IMPACT and PROVE so the launch report can move beyond repo shape.",
  };
}
