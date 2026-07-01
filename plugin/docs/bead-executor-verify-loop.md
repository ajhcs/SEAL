# Bead Executor And Verify Loop

Use this loop when an engineer or agent starts implementing the current SEAL bead queue. The goal is to make each bead executable from tracker state alone, prove the acceptance criteria before closeout, and keep git, bd, and closure evidence synchronized.

## Operating Rules

- Treat `bd` as the tracker of record. Read the bead before coding, claim it before editing, and close it only after evidence exists.
- Do not close `seal-product-guided-layer` directly. It closes last, after the product capability beads and dogfood evidence satisfy the epic.
- Prefer ready P0 non-epic work first. For the current queue, start with `seal-skill-quality-audit`, then `seal-rigor-profiles`, then the P1 generated-view beads, then publication hygiene and epic closeout as dependencies become true.
- Keep generated views non-authoritative. Generated dashboards, Mermaid files, reports, indexes, and context packs must point back to canonical `.seal/*.yaml` records or visible gaps.
- Any failing closeout evidence reopens the bead with `npm run closure:enforce`; do not waive the failure in prose.

## Preflight

Run this from the repository root before choosing a bead:

```bash
bd onboard
git status -sb
git pull --rebase --autostash
bd sync
bd info --json
bd dep cycles
bd ready
npm ci
```

Verification requirements:

- `bd info --json` must not show a repo ID mismatch or unhealthy daemon.
- `bd dep cycles` must report no cycles.
- `bd ready` should be the source for the next bead, not memory or stale notes.
- If local changes exist before the session, identify whether they are yours. Do not overwrite unrelated user work.

## Pick And Claim

1. Select the highest-priority ready bead that is not the product epic unless you are explicitly doing final closeout.
2. Read the bead and dependency context:

```bash
bd show <bead-id>
bd dep tree <bead-id>
```

3. Claim it:

```bash
bd update <bead-id> --status in_progress
bd sync
```

4. Write a short execution brief in your working notes before editing:

```text
Bead:
Acceptance criteria:
Files likely touched:
Tests/evidence required:
Generated artifacts:
Risks/open decisions:
Definition of done:
```

If the acceptance criteria are not testable, update the bead before implementing. If the bead exposes a product decision that cannot be inferred locally, mark the decision explicitly in the bead and stop only after the blocker is durable.

## Execute

Work in small proof slices:

1. Add or update the focused tests first when practical.
2. Implement the smallest change that satisfies one acceptance clause.
3. Run the focused test or command for that clause.
4. Repeat until every acceptance clause has a command and evidence path.
5. Regenerate derived artifacts only through the supported SEAL command surface.
6. Inspect generated files for traceability, generated-view notices, and visible unknowns.

Use the current bead intent:

- `seal-skill-quality-audit`: produce `.seal/reports/skill-quality-audit.md`; inspect every `plugin/skills/**/SKILL.md`, `src/cli/seal.mjs`, docs, and human-vs-AI docs boundaries; convert blocking findings into beads.
- `seal-rigor-profiles`: implement explicit `explore`, `standard`, `launch`, and opt-in `mission-critical` policy behavior with routing, readiness, gate, and CLI tests.
- `seal-human-dashboard`: generate `.seal/views/dashboard.md` with compact traceable sections and non-authoritative labeling.
- `seal-mermaid-navigation`: generate multiple scoped `.seal/views/*.mmd` diagrams with per-diagram complexity limits, split/truncation notices, stable node IDs, and canonical resolution.
- `seal-publish-remote`: record the publication transcript and create follow-up beads for branch, upstream, sync, or remote mismatches.

## Verify Loop

Before closing a bead, run this sequence until it is green:

```bash
git status --short
bd dep cycles
npm test
npm run test:closure
npm run smoke:plugin
bd sync
```

For report-only beads with no code changes, `npm test` may be skipped only if the bead evidence explains why. Still run `bd dep cycles`, `bd sync`, and any command named by the bead acceptance criteria.

Then check the bead semantically:

- Every acceptance criterion has at least one validation command.
- Every acceptance criterion has at least one evidence path.
- Every changed source path and changed test path exists.
- Generated artifacts are labeled generated/non-authoritative when required.
- Generated claims resolve to canonical SEAL IDs, source refs, evidence refs, or explicit gaps.
- New blockers are filed as beads before closeout.

## Closure Evidence

Closed P0/P1 beads require `.seal/closure/<bead-id>.yaml`. Use the bead's exact acceptance criteria and map each criterion to commands and paths:

```yaml
bead_id: <bead-id>
acceptance_criteria:
  - <exact bead acceptance criterion>
implementation_summary: <what changed and why it satisfies the bead>
changed_source_paths:
  - src/example.mjs
changed_test_paths:
  - tests/example.test.mjs
validation_commands:
  - npm test
  - npm run smoke:plugin
proof_result: passed
criteria_coverage:
  - acceptance_criterion: <exact bead acceptance criterion>
    validation_commands:
      - npm test
    evidence_paths:
      - tests/example.test.mjs
```

Validate evidence before closing:

```bash
npm run test:closure
```

If it fails for closed P0/P1 beads, reopen automatically:

```bash
npm run closure:enforce
```

## Close And Land

When the bead is implemented and verified:

```bash
bd close <bead-id> --reason "Acceptance criteria satisfied and closure evidence passed."
bd sync
git status --short
git add .
git commit -m "<concise bead-oriented commit message>"
git pull --rebase --autostash
bd sync
git push
git status -sb
```

Final verification:

- `git status -sb` must show the branch tracking origin with no ahead/uncommitted work.
- `bd ready` should reflect the next executable bead.
- `bd dep cycles` must still pass.
- Any follow-up discovered during implementation must exist as a bead with enough detail for the next engineer.

## Stop Conditions

Stop and update the bead instead of guessing when:

- A required product decision is missing.
- The bead conflicts with source authority or generated-view rules.
- The implementation would silently weaken validation, closure evidence, or visible unknowns.
- External publication, network access, or credential behavior is needed but not explicitly authorized.
- Tests pass mechanically but do not cover the acceptance criteria.
