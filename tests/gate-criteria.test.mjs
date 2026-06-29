import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GATE_CRITERIA,
  GATE_LEVELS,
  GATE_PHASES,
  criteriaByPhase,
  evaluateGateCriteria,
  getGateCriterion
} from "../src/gates/criteria.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const expectedIds = [
  "gate.plan.schema-valid",
  "gate.plan.source-authority-visible",
  "gate.plan.low-confidence-warning",
  "gate.build.references-intact",
  "gate.build.file-coverage-complete",
  "gate.build.open-map-gaps-warning",
  "gate.prove.claim-has-evidence-or-gap",
  "gate.prove.no-failed-evidence",
  "gate.prove.stale-evidence-warning",
  "gate.prove.accepted-gap-warning",
  "gate.launch.unmapped-files-block-launch",
  "gate.launch.known-unknowns-visible",
  "gate.launch.pending-approval-warning",
  "gate.launch.weak-authority-warning"
];

const fixtures = new Map([
  [
    "gate.plan.schema-valid",
    {
      validation: {
        diagnostics: [{ artifactType: "map", path: "/", message: "schema failed" }]
      }
    }
  ],
  [
    "gate.plan.source-authority-visible",
    {
      validation: {
        diagnostics: [{ artifactType: "authority", path: "/map/components/0", message: "weak authority" }]
      }
    }
  ],
  [
    "gate.plan.low-confidence-warning",
    {
      map: {
        sources: [{ id: "src.low", confidence: 0.4 }]
      }
    }
  ],
  [
    "gate.build.references-intact",
    {
      validation: {
        diagnostics: [{ artifactType: "reference", path: "/proof/claims/0", message: "dangling ref" }]
      }
    }
  ],
  [
    "gate.build.file-coverage-complete",
    {
      validation: {
        diagnostics: [{ artifactType: "coverage", code: "uncovered_file", path: "/map/files/0" }]
      }
    }
  ],
  [
    "gate.build.open-map-gaps-warning",
    {
      map: {
        gaps: [{ id: "gap.map-open", status: "open" }]
      },
      launchReport: {
        known_unknowns: [{ id: "gap.map-open" }]
      }
    }
  ],
  [
    "gate.prove.claim-has-evidence-or-gap",
    {
      proof: {
        claims: [{ id: "claim.empty", evidence_refs: [], gap_refs: [] }]
      }
    }
  ],
  [
    "gate.prove.no-failed-evidence",
    {
      evidenceIndex: {
        evidence: [{ id: "ev.failed", status: "failed" }]
      }
    }
  ],
  [
    "gate.prove.stale-evidence-warning",
    {
      evidenceIndex: {
        evidence: [{ id: "ev.stale", status: "stale" }]
      }
    }
  ],
  [
    "gate.prove.accepted-gap-warning",
    {
      proof: {
        gaps: [{ id: "gap.accepted", status: "accepted" }]
      }
    }
  ],
  [
    "gate.launch.unmapped-files-block-launch",
    {
      launchReport: {
        blockers: [{ id: "block.unmapped", kind: "unmapped_file" }]
      }
    }
  ],
  [
    "gate.launch.known-unknowns-visible",
    {
      proof: {
        gaps: [{ id: "gap.hidden", status: "open" }]
      },
      launchReport: {
        known_unknowns: []
      }
    }
  ],
  [
    "gate.launch.pending-approval-warning",
    {
      map: {
        launch_gates: [{ id: "launch.pending", approval_state: "pending" }]
      }
    }
  ],
  [
    "gate.launch.weak-authority-warning",
    {
      launchReport: {
        known_unknowns: [{ id: "gap.weak", authority_state: "unknown" }]
      }
    }
  ]
]);

assert.deepEqual(GATE_CRITERIA.map((criterion) => criterion.id), expectedIds);
assert.equal(new Set(GATE_CRITERIA.map((criterion) => criterion.id)).size, GATE_CRITERIA.length);

for (const criterion of GATE_CRITERIA) {
  assert.ok(GATE_PHASES.includes(criterion.phase), `${criterion.id} has unknown phase`);
  assert.ok(GATE_LEVELS.includes(criterion.level), `${criterion.id} has unknown level`);
  assert.ok(["fail", "warn"].includes(criterion.decision), `${criterion.id} has unknown decision`);
  assert.equal(typeof criterion.plain_language, "string", `${criterion.id} needs plain language`);
  assert.ok(criterion.plain_language.length > 20, `${criterion.id} plain language should explain the rule`);
  assert.equal(typeof criterion.validator_signal, "string", `${criterion.id} needs validator signal`);
  assert.equal(typeof criterion.evidence_needed, "string", `${criterion.id} needs evidence guidance`);
  assert.equal(typeof getGateCriterion(criterion.id).evaluate, "function", `${criterion.id} should be retrievable`);
}

for (const [id, fixture] of fixtures) {
  const triggered = evaluateGateCriteria(fixture).map((criterion) => criterion.id);
  assert.deepEqual(triggered, [id], `${id} fixture should trigger exactly one criterion`);
}

const criteriaIds = new Set(GATE_CRITERIA.map((criterion) => criterion.id));
assert.equal(fixtures.size, criteriaIds.size, "every criterion should have one fixture");
for (const id of criteriaIds) {
  assert.ok(fixtures.has(id), `${id} needs a trigger fixture`);
}

const byPhase = criteriaByPhase();
for (const phase of GATE_PHASES) {
  assert.ok(byPhase[phase].some((criterion) => criterion.level === "hard_fail"), `${phase} needs a hard fail`);
  assert.ok(byPhase[phase].some((criterion) => criterion.level === "warn"), `${phase} needs a warning`);
}

const doc = await readFile(path.join(root, "plugin", "docs", "gate-criteria.md"), "utf8");
for (const id of expectedIds) {
  assert.ok(doc.includes(`\`${id}\``), `gate criteria doc should include ${id}`);
}

const manifest = JSON.parse(await readFile(path.join(root, "plugin", "manifest.json"), "utf8"));
assert.ok(
  manifest.docs.some((docEntry) => docEntry.id === "gate-criteria" && docEntry.path === "docs/gate-criteria.md"),
  "plugin manifest should expose gate criteria docs"
);

console.log("Gate criteria define plan/build/prove/launch hard fails and warnings with one fixture per trigger.");
