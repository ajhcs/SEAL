# SEAL Personas And Guided Jobs

SEAL is for people who need a plan or codebase to become inspectable, maintainable, and launchable without learning systems-engineering vocabulary first.

## First Personas

### Plan Owner Starting From gstack Output

- Input: a generated Markdown plan, product brief, implementation outline, milestone list, or launch checklist.
- Fear: the plan looks complete, but no one knows what is assumed, unproven, blocked, or risky.
- Expected output: SEAL turns the plan into MAP, IMPACT, PROVE, validation, and launch gate artifacts with visible gaps.
- First-run sentence: Use SEAL on this gstack-style plan to show what exists, what changes, what would prove it, and what blocks launch.

### Founder Or Product Builder

- Input: a concept note, roadmap, user promise, scope list, or feature request.
- Fear: the team starts building from persuasive language instead of testable commitments.
- Expected output: SEAL separates requirements, assumptions, risks, decisions, proof needs, and launch gates.
- First-run sentence: Use SEAL on this plan to turn the idea into visible commitments, proof needs, and launch blockers.

### Developer Starting From An Existing Repo

- Input: a repository, existing `.seal` artifacts, README files, source files, tests, and config.
- Fear: changing code will break hidden behavior or leave unmapped files and missing tests behind.
- Expected output: SEAL maps components, files, tests, unknowns, impact records, proof gaps, and validation status.
- First-run sentence: Use SEAL to map this repo and tell me what is known, unknown, tested, and risky.

### Delivery Lead Or Launch Reviewer

- Input: a release candidate, change summary, test output, risk list, or approval checklist.
- Fear: the launch decision depends on status claims that are not linked to evidence.
- Expected output: SEAL produces readable proof gaps and launch readiness reports that separate proven, inferred, blocked, failed, and missing evidence.
- First-run sentence: Use SEAL to show which launch claims have evidence and which gaps still block release.

## Top Guided Jobs

1. Start from a plan file and create starter `.seal` artifacts that preserve source authority.
2. Start from a repository and map files, tests, components, unknowns, and coverage gaps.
3. Turn a proposed change into an IMPACT record that lists affected files, tests, proof needs, and launch gates.
4. Turn claims into PROVE records with evidence or explicit gaps.
5. Produce validation, proof gap, and launch readiness reports that a beginner can act on.

## Non-Goals

- SEAL does not write the product plan for the user.
- SEAL does not claim inferred content is approved fact.
- SEAL does not replace tests, review, owner approval, or release authority.
- SEAL does not promise zero technical debt or guaranteed correctness.
- SEAL does not make gstack, ChatGPT Apps, or marketplace distribution the P0 product surface.

## Beginner-Safe Terms

- Use "What exists?" for MAP when introducing the workflow.
- Use "What changes?" for IMPACT when introducing change analysis.
- Use "What would prove it?" for PROVE when introducing evidence.
- Use "What blocks launch?" for launch gates, risks, missing proof, and unresolved authority gaps.
- Explain source authority as "where this came from and whether it was observed, inferred, or approved."
- Explain traceability as "the link from a claim to its source, evidence, and unresolved gaps."

## Terms To Hide Or Explain

- Hide or explain RTM, V&V, FMEA, reference integrity, schema validation, and proof taxonomy in beginner-facing copy.
- Keep MAP, IMPACT, PROVE, evidence, gaps, and gates as artifact names after the plain-language labels are introduced.
- Never use systems-engineering vocabulary as the only public explanation of a workflow.
