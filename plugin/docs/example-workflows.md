# Example Workflows

These examples use the current SEAL command surface and small fixtures so a maintainer can prove the workflow before using it on a real project.

Each example answers the same four public questions:

- What exists?
- What changes?
- What would prove it?
- What blocks launch?

Run examples from the SEAL checkout after `npm install`.

## Plain Markdown Plan

Use this when the source of truth is a short plan, launch note, or ticket instead of a repository.

```bash
mkdir .tmp-seal-examples
copy tests\fixtures\markdown-plans\sparse.md .tmp-seal-examples\sparse.md
node src/cli/seal-invoke.mjs .tmp-seal-examples\sparse.md
node src/cli/seal-proof-report.mjs .tmp-seal-examples
node src/cli/seal-launch-report.mjs .tmp-seal-examples
node src/cli/seal-validate.mjs .tmp-seal-examples
```

Expected outputs:

- `.seal/map.yaml` records the plan file as the observed source and extracts requirements where possible.
- `.seal/debt.yaml` keeps unresolved unknowns visible.
- `.seal/reports/gap-review.md` explains what the plan did not prove.
- `.seal/reports/proof-gaps.md` lists claims that still need evidence.
- `.seal/reports/launch-readiness.md` says whether the plan is ready, warned, or blocked.

Useful next action: review `.seal/map.yaml` and decide whether extracted requirements are approved facts or still inferred.

## Gstack-Style Plan

Use this when a planning tool produced structured Markdown with goals, implementation notes, risks, assumptions, and gates.

```bash
mkdir .tmp-seal-examples
copy tests\fixtures\markdown-plans\gstack-style.md .tmp-seal-examples\gstack-style.md
node src/cli/seal-invoke.mjs .tmp-seal-examples\gstack-style.md
node src/cli/seal-proof-report.mjs .tmp-seal-examples
node src/cli/seal-launch-report.mjs .tmp-seal-examples
node src/cli/seal-validate.mjs .tmp-seal-examples
```

Expected outputs:

- `.seal/map.yaml` includes inferred requirements, risks, assumptions, trace links, and launch gates from the plan.
- `.seal/reports/gap-review.md` separates direct mappings, inferred items, and unresolved items.
- `.seal/proof.yaml` keeps generated claims pending until evidence or human approval is attached.

Useful next action: resolve `gap.plan-gstack-import-review` by approving, editing, or rejecting inferred records before launch decisions depend on them.

## Existing Project

Use this when a repository already exists and SEAL should map the files before impact or proof work starts.

```bash
mkdir .tmp-seal-examples
xcopy tests\fixtures\repo-tiny .tmp-seal-examples\repo-tiny /E /I /Q
node src/cli/seal-invoke.mjs .tmp-seal-examples\repo-tiny
node src/cli/seal-impact.mjs .tmp-seal-examples\repo-tiny src/index.js "Assess the public entrypoint"
node src/cli/seal-proof-report.mjs .tmp-seal-examples\repo-tiny
node src/cli/seal-launch-report.mjs .tmp-seal-examples\repo-tiny
node src/cli/seal-validate.mjs .tmp-seal-examples\repo-tiny
```

Expected outputs:

- `.seal/map.yaml` lists observed files, components, and static inspection gaps.
- `.seal/impacts/IMPACT-src-index-js.yaml` records affected scope and proof obligations for `src/index.js`.
- `.seal/reports/launch-readiness.md` explains whether missing proof, authority, or coverage blocks launch.

Useful next action: attach test output or review evidence in `.seal/evidence/index.yaml`, then rerun proof, launch, and validation.

## Clean Up

The example commands write only into `.tmp-seal-examples`. Remove that folder when finished:

```bash
rmdir /S /Q .tmp-seal-examples
```
