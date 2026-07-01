# Launch Readiness Report

`seal-launch-report` writes `.seal/reports/launch-readiness.md`.

The report is the beginner-readable launch decision. It summarizes the current gate policy, SEAL Readiness Level (SRL), map coverage, impact obligations, proof state, visible unknowns, high-risk assumptions, and next actions. Each conclusion lists artifact links such as `map.gap:gap.id`, `impact.proof_required:proof.id`, `proof.claim:claim.id`, or `validation:/path` so the reader can inspect the underlying source instead of trusting a checklist.

The report is intentionally conservative:

- failed validation, broken references, incomplete coverage, failed evidence, and hidden unknowns block launch;
- open impact proof obligations or approvals block launch until resolved or explicitly gapped;
- weak authority, stale evidence, low confidence records, pending approvals, and accepted proof gaps remain visible as launch cautions;
- open MAP and PROVE gaps are carried into `known_unknowns` so uncertainty is visible.

The report includes the selected rigor profile and the profile's required artifacts, evidence expectation, approval expectation, launch gates, and escalation recommendations. The default profile is `standard`.

Use `--profile` when the launch decision needs a different assurance level:

```bash
seal-launch-report . --profile launch
seal launch . --profile mission-critical
```

Use `mission-critical` only when that assurance level is explicit in the user request, artifact set, config, or command flag.

SRL is a plain-language maturity summary, not a replacement for gates:

| Level | Meaning |
| --- | --- |
| `SRL-0` | Fix foundations: hard failures or missing artifact coverage make launch reasoning unsafe. |
| `SRL-1` | Repo mapped: MAP has repo shape, but impact and proof are thin. |
| `SRL-2` | Impact scoped: impact is visible, but proof still needs to be added. |
| `SRL-3` | Proof developing: proof exists, but blockers or unknowns still prevent launch confidence. |
| `SRL-4` | Ready with cautions: no blockers or unknowns, but launch-owner cautions remain. |
| `SRL-5` | Launch ready: mapped scope, proof evidence, and gate policy are passing. |

When the launch decision and SRL feel different, trust the gate decision first and use SRL only to explain where the workflow is in plain language.

Run it after MAP, IMPACT, PROVE, and validation artifacts exist:

```bash
seal-launch-report .
```
