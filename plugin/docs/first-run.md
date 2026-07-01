# First Run Guide

SEAL reads a repository or plan, creates a `.seal` folder, and makes four questions visible:

- What exists?
- What changes?
- What would prove it?
- What blocks launch?

The internal files still use MAP, IMPACT, PROVE, evidence, gaps, and gates because those names keep validation precise. Start with the plain questions above, then use the artifact names when you need to inspect the records.

For public workflow labels, starter questions, and terms to avoid, use `plugin/docs/glossary.md`.

## Start In Codex

The Codex entrypoint is the SEAL skill, not a `/seal` slash command. Installing
the npm package globally makes the `seal` terminal command available, but it
does not by itself register a Codex skill or slash command.

For local Codex plugin development, use the plugin-creator marketplace flow
rather than copying skill files by hand. The default personal marketplace file
is `%USERPROFILE%\.agents\plugins\marketplace.json` on Windows
(`~/.agents/plugins/marketplace.json` elsewhere). Its SEAL entry should point
to `./plugins/seal` relative to that marketplace root.

When iterating on this checkout, update the plugin cachebuster with the
plugin-creator helper:

```powershell
python C:\Users\colet\.codex\skills\.system\plugin-creator\scripts\update_plugin_cachebuster.py plugin
```

Then read the marketplace name from the default personal marketplace:

```powershell
python C:\Users\colet\.codex\skills\.system\plugin-creator\scripts\read_marketplace_name.py
```

Use the printed marketplace name to reinstall SEAL:

```powershell
codex plugin add seal@<marketplace-name>
```

Start a new Codex thread after reinstalling so the updated skills and metadata
are loaded.

Do not run `codex plugin marketplace add` for the default personal marketplace;
Codex discovers `%USERPROFILE%\.agents\plugins\marketplace.json` implicitly.
Use `codex plugin marketplace add <path-to-marketplace-root>` only for an
explicit non-default repo/team marketplace path, and read that marketplace name
with:

```powershell
python C:\Users\colet\.codex\skills\.system\plugin-creator\scripts\read_marketplace_name.py --marketplace-path <path-to-marketplace.json>
```

Open the project you want to inspect and ask:

```text
Use SEAL to map this repo and tell me what is unknown.
```

Give Codex the repository path or the Markdown plan you want inspected. Codex should inspect first and infer cautiously. It may ask for authority only when the files cannot answer a decision, such as:

- Which plan, ticket, or document is the source of truth?
- Who can approve launch or accept a risk?
- Which changed file, component, or requirement should impact analysis start from?
- Is a missing test acceptable debt, or should it block launch?

It should not ask broad setup questions when it can inspect the project directly.

## Start From Terminal

From the SEAL plugin checkout, install dependencies once:

```bash
npm install
```

Then run SEAL against a repository directory:

```bash
node src/cli/seal-invoke.mjs <path>
node src/cli/seal-impact.mjs <path> <target> [summary]
node src/cli/seal-proof-report.mjs <path>
node src/cli/seal-launch-report.mjs <path>
node src/cli/seal-validate.mjs <path>
```

Use `<path>` for the repository or `.seal` workspace directory. Use `<target>` for the changed file, component id, requirement id, or artifact id you want to assess.

For a Markdown plan file, start with the file and then use the containing directory for follow-up commands:

```bash
node src/cli/seal-invoke.mjs <workspace>\plan.md
node src/cli/seal-proof-report.mjs <workspace>
node src/cli/seal-launch-report.mjs <workspace>
node src/cli/seal-validate.mjs <workspace>
```

If you install or link the package, the same commands are available as `seal-invoke`, `seal-impact`, `seal-proof-report`, `seal-launch-report`, and `seal-validate`. From a fresh clone without linking, `npm exec -- seal-invoke <path>` also runs the package binary.

For a quick plugin smoke check, run:

```bash
npm run smoke:plugin
```

## What It Creates

SEAL writes local artifacts under `.seal` in the inspected project:

- `.seal/map.yaml`: what exists, including files, components, requirements, source authority, and visible unknowns.
- `.seal/reports/map.md`: a readable inventory view.
- `.seal/reports/map.mmd`: a Mermaid map view for dependency review.
- `.seal/debt.yaml`: unresolved unknowns and follow-up work that should not be hidden in notes.
- `.seal/impacts/IMPACT-initial.yaml`: the first impact record from invocation.
- `.seal/impacts/IMPACT-*.yaml`: later impact records for specific changes.
- `.seal/proof.yaml`: claims, evidence links, and gaps for what would prove the work.
- `.seal/evidence/index.yaml`: evidence records with source, capture time, limitations, redaction state, and file hashes when evidence files are stored.
- `.seal/reports/gap-review.md`: plain review of unknowns found during ingestion.
- `.seal/reports/proof-gaps.md`: claims that lack enough evidence.
- `.seal/reports/launch-readiness.md`: pass, warn, or block launch based on gates, proof, gaps, and authority.

These files are meant to be committed with the project when they describe real project state.

## What Done Looks Like

A first run is done when:

- `node src/cli/seal-validate.mjs <path>` reports the artifacts are valid.
- Every non-ignored project file is mapped to a component or listed as an explicit gap.
- Requirements, decisions, and evidence name their source authority instead of pretending guesses are facts.
- Unknowns are visible in `.seal/debt.yaml` or a gap report.
- The launch report says whether launch is allowed, warned, or blocked, and why.

Valid does not always mean ready to launch. Valid means the records are structured, traceable, and honest about what remains unknown.

## If SEAL Finds Unknowns

Do not delete unknowns just to get a cleaner report. Pick one of these actions:

- Add the missing source, test, plan, ticket, or evidence.
- Mark the item as accepted risk with the approving authority.
- Keep it as debt with a next action and owner.
- Rerun impact, proof, launch, and validation after updating the artifacts.

Unknowns are useful because they show where proof is missing.

## Troubleshooting

- `Cannot find module`: run `npm install` from the SEAL plugin checkout.
- `Usage:` output: check that the command received the required `<path>` and, for impact, `<target>`.
- `schema` or `expected shape` validation errors: open the file and path named by `seal-validate`; the message includes the expected value shape and a suggested fix.
- `reference` validation errors: an artifact points to an id that does not exist. Add the missing record or fix the id.
- `file coverage` validation errors: a non-ignored file is not mapped. Add it to `.seal/map.yaml` or record an explicit gap or debt item.
- `source authority` validation errors: an approved baseline is relying on inferred or unknown authority. Link the actual source of truth before treating it as approved.
- `launch blocked`: read `.seal/reports/launch-readiness.md`, then resolve or explicitly accept the listed proof, risk, authority, or coverage gaps.

## Clean First-Run Check

To prove the workflow on a disposable copy, copy a small repo to a temporary folder and run:

```bash
node src/cli/seal-invoke.mjs <temp-repo>
node src/cli/seal-impact.mjs <temp-repo> src/index.js "Check first-run impact"
node src/cli/seal-proof-report.mjs <temp-repo>
node src/cli/seal-launch-report.mjs <temp-repo>
node src/cli/seal-validate.mjs <temp-repo>
```

After those commands, inspect `.seal/reports/gap-review.md`, `.seal/reports/proof-gaps.md`, and `.seal/reports/launch-readiness.md`. A useful first run tells you what is known, what changed, what proof is missing, and what blocks launch.
