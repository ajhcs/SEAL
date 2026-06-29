---
name: seal-plan
description: Plan new features with SEAL source authority, explicit assumptions, traceable requirements, impact questions, proof needs, and launch gates. Use when the user asks to design, scope, plan, refine, de-risk, or prepare a new feature, product change, implementation plan, roadmap item, gstack-style plan, or launch-ready work plan.
---

# SEAL Plan

Use SEAL Plan to turn a feature idea into a traceable, launch-aware plan. The plan must be useful to beginners who need plain language and to experienced builders who need source authority, risks, proof obligations, and handoff-ready next actions.

## Operating Rules

- Inspect available repo files, docs, tickets, plans, and existing `.seal` artifacts before asking questions.
- Treat source authority as visible evidence: file paths, issue ids, user-provided requirements, docs, tests, design notes, API contracts, schemas, or product decisions.
- Ask only for missing authority or decisions that cannot be inferred from local materials.
- Separate facts, assumptions, gaps, and recommendations.
- Do not invent product constraints, user promises, metrics, compliance needs, or launch criteria.
- Keep the output usable by non-technical users without removing the details experts need to act.
- Prefer updating or producing a durable Markdown plan when the user asks for an artifact; otherwise provide the plan directly in the conversation.

## Workflow

### 1. Establish Intent

Start from the user's requested change and any files or issues they reference. Capture:

- Target user or operator.
- User-visible outcome.
- Non-goals and constraints.
- Known source authority.
- Unknown decisions that block planning.

If the request is vague, inspect the repo and docs first, then ask the smallest set of clarifying questions.

### 2. Inspect Source Authority

Look for existing implementation, architecture, tests, docs, schemas, open issues, and `.seal` artifacts. Identify the authoritative materials that should shape the plan.

Useful local commands when they fit the situation:

```bash
seal repo map <directory>
seal plan ingest <plan.md>
seal validate <directory>
```

Use `seal plan ingest <plan.md>` after a plan file exists and the user wants it connected to SEAL artifacts. Do not claim SEAL validation passed unless the command ran.

### 3. Draft The Feature Plan

Produce a plan that includes:

- Goal: what changes for the user.
- Users: who benefits, who operates it, and who can be harmed by mistakes.
- Scope: included work and excluded work.
- Requirements: traceable bullets tied to source authority or clearly marked assumptions.
- UX or workflow changes: what the user will see or do differently.
- Technical work: components, files, interfaces, data, tests, docs, migrations, rollout, and observability where applicable.
- Acceptance criteria: what must be true before the work is done.

Keep the plan practical. Avoid turning a small feature into a broad program unless the evidence requires it.

### 4. Seed MAP, IMPACT, And PROOF

For every meaningful requirement, note what SEAL will need later:

- MAP seeds: components, files, dependencies, tests, and docs likely involved.
- IMPACT questions: what could break, who is affected, and what contracts might change.
- PROOF needs: tests, evidence, demos, metrics, manual checks, review records, or launch gates.
- Gaps: missing source authority, unresolved choices, blocked access, or unverified assumptions.

### 5. Set Launch Gates

Define launch gates in user-readable terms. Typical gates include:

- Required tests pass.
- User workflow is validated.
- Data migration or rollback path is known.
- Security, privacy, compliance, or permissions risks are reviewed if relevant.
- Documentation and operator handoff are complete.
- Known gaps are either closed or explicitly accepted by the right authority.

Never mark a gate satisfied without evidence.

## Output Format

Use this structure unless the user requests a specific artifact format:

```markdown
## Feature Plan

### Decision
What should be built, paused, or clarified next.

### Source Authority
Files, issues, docs, user statements, tests, or artifacts used as evidence.

### Requirements
Traceable requirements with source or assumption labels.

### Scope
Included work, excluded work, dependencies, and constraints.

### Implementation Plan
Concrete steps ordered for execution.

### Impact Questions
What might break or need review before implementation.

### Proof Needed
Tests, checks, evidence, and review records needed to trust the work.

### Launch Gates
Conditions that must be satisfied before release.

### Gaps
Unknowns, missing authority, and decisions needed.

### Next Actions
Smallest useful next steps.
```

## User Modes

- Beginner: explain SEAL terms in plain language, keep the plan readable, and name the first next step.
- Builder: include files, commands, tests, and implementation sequence.
- Reviewer: emphasize assumptions, risk, proof gaps, and launch gates.
- Expert: preserve detailed traceability, artifact implications, and validation commands.

## Handoff

End with a concise handoff that states what is ready, what is blocked, what evidence supports the plan, and what should happen next. If files changed, name them. If validation was not run, say so directly.
