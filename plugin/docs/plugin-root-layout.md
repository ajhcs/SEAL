# Codex Plugin Root Layout

SEAL uses `plugin/` as the installable Codex plugin root.

The Codex ingestion manifest lives at `plugin/.codex-plugin/plugin.json` and declares only files that are inside the plugin archive. In v1 that means the `skills/` directory and plugin interface metadata. The manifest does not point at `../src`, package bins, or any other path outside `plugin/`.

`plugin/manifest.json` remains SEAL-owned product metadata. It documents the wider local development surface, including package binaries under `src/cli`, schemas, docs, fixtures, and source authority. That file is validated by SEAL tests, but it is not the Codex ingestion manifest.

Runtime commands are package prerequisites, not plugin archive contents. From a cloned checkout, install dependencies with `npm ci` or `npm install`, then run `npm exec -- seal ...` or the focused `seal-*` binaries documented in `README.md` and `plugin/docs/first-run.md`.

This layout was chosen because it keeps Codex plugin paths archive-local while preserving the existing repo-local CLI implementation. If SEAL later needs to ship runtime code inside the plugin archive, that should be a separate bundle-generation decision with drift tests.
