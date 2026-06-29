# SEAL Plugin Root

This directory contains the installable Codex plugin product surface.

Current contents:

- `manifest.json` - SEAL-owned plugin distribution metadata validated against local files.
- `skills/seal/SKILL.md` - skill instructions for the SEAL workflow.
- `schemas/` - artifact schemas used by generators and validators.
- `fixtures/` - small example artifacts for regression tests.
- `docs/` - plugin-facing documentation, including the product contract, plain-language glossary, artifact template, source authority rules, example workflows, release checklist, launch assets, and the local plugin smoke procedure.

The manifest currently describes a local Codex plugin scaffold. ChatGPT App submission metadata is intentionally separate until an adapter exists for that surface.

Run `npm run smoke:plugin` from the repository root to check plugin discovery, command metadata, starter invocation, generated artifacts, and validation before trying manual Codex UI loading.
