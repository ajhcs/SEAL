# Artifact Templates

SEAL starter artifacts are working records, not blank forms. A generated `.seal` folder includes:

- `map.yaml` with source, component, file, and gap records.
- `impacts/IMPACT-initial.yaml` with a starter change, affected record, proof need, proof obligation, approval obligation, and gap.
- `proof.yaml` with a starter claim linked to a visible gap.
- `evidence/index.yaml` with intentionally incomplete starter evidence.

Every generated artifact uses `schema_version: 0.2.0`. If validation reports a different version, follow `plugin/docs/migration-policy.md` before relying on the artifact.

Template records include plain-language guidance fields such as `plain_language`, `purpose`, `next_step`, `example_change`, or `how_to_complete` where they help a non-expert user take the next step.

Templates must not make uncertainty look resolved. If SEAL has not inspected, validated, or received authority for something, the artifact should record that as a gap, incomplete evidence, pending approval, or reduced confidence.

Generated impact records must explain every affected record with a reason. They must also turn the affected scope into actionable `proof_required` and `approval_needed` records, such as affected test commands, schema/static reviews, requirement checks, risk approvals, launch approvals, or explicit gap acceptance. When the MAP cannot authoritatively link a change to interfaces, invariants, services, dependencies, costs, tests, or proof, the impact should include a visible gap rather than dropping that question from the scope.
