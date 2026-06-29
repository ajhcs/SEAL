# Launch Readiness Report

`seal-launch-report` writes `.seal/reports/launch-readiness.md`.

The report is the beginner-readable launch decision. It summarizes the current gate policy, map coverage, impact obligations, proof state, visible unknowns, high-risk assumptions, and next actions. Each conclusion lists artifact links such as `map.gap:gap.id`, `impact.proof_required:proof.id`, `proof.claim:claim.id`, or `validation:/path` so the reader can inspect the underlying source instead of trusting a checklist.

The report is intentionally conservative:

- failed validation, broken references, incomplete coverage, failed evidence, and hidden unknowns block launch;
- open impact proof obligations or approvals block launch until resolved or explicitly gapped;
- weak authority, stale evidence, low confidence records, pending approvals, and accepted proof gaps remain visible as launch cautions;
- open MAP and PROVE gaps are carried into `known_unknowns` so uncertainty is visible.

Run it after MAP, IMPACT, PROVE, and validation artifacts exist:

```bash
seal-launch-report .
```
