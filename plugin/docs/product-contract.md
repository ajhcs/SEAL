# SEAL Product Contract

SEAL is a local-first Codex plugin for people who need a project plan or codebase to become inspectable before they change or launch it. It is for builders, technical leads, founders, and planners who may not use systems-engineering vocabulary but still need disciplined traceability, visible unknowns, and evidence-backed launch decisions.

## What You Give SEAL

SEAL accepts one of these inputs:

- A repository that Codex can inspect on the local filesystem.
- A Markdown plan, including gstack-style output, product notes, or an implementation brief.
- Existing `.seal` artifacts that need validation, impact analysis, proof review, or launch reporting.

SEAL treats observed files, user-provided plans, generated artifacts, and agent assumptions as different source authorities. It must not hide inferred content as fact. If a source is weak, missing, stale, or inferred, the output must say so.

## What SEAL Gives Back

SEAL writes a `.seal` workspace that makes the project state visible:

- MAP: components, files, tests, interfaces, source authority, dependencies, and unmapped gaps.
- IMPACT: what a proposed change touches, what is unknown, which files and components may be affected, and what proof is required before launch.
- PROVE: claims linked to evidence records and explicit gaps, including stale, weak, failed, or missing proof.
- VALIDATE: schema, reference, file coverage, and authority checks with actionable diagnostics.
- LAUNCH: a readiness report that explains whether plan, build, prove, and launch gates pass, warn, or block.

The output is not a promise that the project is correct. It is a traceable record of what SEAL observed, what it inferred, what it could not prove, and what remains risky.

## Why Trust It

SEAL is trustworthy when it preserves the chain from claim to evidence to gap:

- Every artifact records source authority instead of flattening all statements into equal confidence.
- Unknowns become visible gaps instead of disappearing into prose.
- File coverage checks make unmapped project files explicit.
- Reference checks catch dangling component, file, evidence, and proof links.
- Impact analysis is conservative when evidence is missing.
- Launch readiness can block; a blocked result is useful when proof is absent.

The product promise is zero hidden technical debt and no untraced rework. SEAL does not promise zero technical debt or automatic correctness. It promises that debt, assumptions, missing evidence, and launch blockers are visible enough for a user or agent to act on them.

## How It Complements gstack-Style Planning

gstack-style planning helps a user turn intent into a workable plan. SEAL upgrades that plan into durable artifacts that Codex can revisit: a map of what exists, an impact record for proposed changes, proof records tied to evidence, validation errors that identify broken links, and a launch report that separates ready work from blocked work.

The P0 surface is the Codex plugin and local commands. A ChatGPT App or marketplace adapter is a later distribution layer unless the repository implements and validates that surface.
