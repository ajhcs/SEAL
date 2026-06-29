# Release Checklist

Use this checklist before distributing the local Codex plugin or cutting a versioned release. A release is not done until the code, beads, and remote repository agree.

## Version And Scope

- Choose the release version and update `package.json`.
- Confirm the release contains one coherent workflow slice.
- Update public docs for changed commands, artifact files, limitations, and examples.
- If artifact schemas changed, update `plugin/docs/migration-policy.md`, add old/current version fixtures, and document the upgrade note.
- Record any unfinished work as beads before closing the release session.

## Required Local Gates

Run these from the repository root:

```bash
npm test
npm run smoke:plugin
bd dep cycles
```

The release cannot proceed if any gate fails. If a gate exposes a product decision, create or update a blocked bead with the exact decision needed.

## Manual Confidence Checks

- Read `plugin/manifest.json` and confirm every command path still exists.
- Run at least one disposable first-run workflow from `plugin/docs/example-workflows.md`.
- Inspect `.seal/reports/gap-review.md`, `.seal/reports/proof-gaps.md`, and `.seal/reports/launch-readiness.md` from the disposable run.
- Confirm the docs explain limits plainly and do not imply ChatGPT App availability before an adapter exists.

## Bead Closeout

Before committing:

```bash
bd status
bd dep cycles
bd sync
```

Close completed beads and update unfinished beads with a concrete next action or blocker. Keep `seal-publish-remote` blocked until an authoritative remote URL and credentials exist.

## Git Landing

If a remote and upstream exist:

```bash
git pull --rebase
bd sync
git status --short
git add .
git commit -m "Prepare SEAL release"
git push
git status
```

`git status` must report that the branch is up to date with origin before the release session is complete.

If no remote or upstream exists, do not stop local work. Update `seal-publish-remote` with the blocker, commit the local bundle, and continue ready local work until no useful local work remains or human authority is required.

## Release Notes Template

```markdown
## SEAL <version>

### What changed
- 

### How to verify
- `npm test`
- `npm run smoke:plugin`
- `bd dep cycles`

### Known gaps
- 

### Upgrade notes
- 
```
