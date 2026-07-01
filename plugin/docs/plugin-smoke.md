# Plugin Smoke Procedure

Run this from the repository root:

```bash
npm run smoke:plugin
```

The automated smoke checks:

1. `plugin/manifest.json` is valid and every `package.json` command binary is discoverable through the manifest.
2. The Codex ingestion manifest and packaged skills pass `plugin-creator/scripts/validate_plugin.py` against `plugin/`.
3. The SEAL skill entrypoint exists and describes the supported invocation.
4. `seal-invoke` can run on a fixture repository copied to a temporary directory.
5. The invocation writes `.seal/map.yaml`, `.seal/debt.yaml`, `.seal/impacts/IMPACT-initial.yaml`, `.seal/proof.yaml`, `.seal/evidence/index.yaml`, and `.seal/reports/gap-review.md`.
6. `seal-validate` library validation passes on the generated artifact set.

Codex ingestion failures are reported with `Codex plugin ingestion validation failed`, the plugin root, the validator path, and the underlying plugin-creator diagnostics. SEAL artifact/workflow failures remain separate assertion or validation failures.

Manual Codex UI checks are separate from the automated smoke:

1. Install or point Codex at this local plugin root, or copy the packaged skill
   into `$env:USERPROFILE\.codex\skills\seal`.
2. Confirm the `seal` skill appears as a local plugin skill.
3. Ask Codex to use SEAL on a temporary repository path.
4. Confirm Codex uses the skill rules and writes or updates `.seal` artifacts rather than only summarizing.

The current supported Codex invocation is skill-based. A working global
`seal` terminal command does not prove that `/seal` is registered in Codex, and
`/seal` is not a tested entrypoint for this scaffold.

If the automated smoke fails, inspect the first failing assertion before trying the manual UI path. If only the manual UI path fails, the local command surface and artifacts are still usable; record the UI loading failure as a separate bead with the Codex version and plugin install path.
