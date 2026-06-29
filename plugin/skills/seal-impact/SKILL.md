---
name: seal-impact
description: Analyze what a proposed change affects using SEAL MAP, IMPACT, PROVE, evidence, gaps, tests, dependencies, and launch gates. Use when the user asks what could break, what files, components, or users are affected, what proof is required, or how risky a change is.
---

# SEAL Impact

Use SEAL Impact to connect a proposed change to affected files, components, users, risks, proof needs, and launch gates. The goal is to prevent hidden consequences before implementation or release.

## Operating Rules

- Inspect the current repo, plan, and `.seal` artifacts before giving an impact answer.
- Start from a specific target when possible: file path, component id, feature, workflow, issue, or decision.
- Ask only for missing change intent or source authority after local inspection.
- Separate confirmed impact from plausible impact and unknown impact.
- Do not downgrade a risk just because evidence is missing; missing evidence is a gap.
- Keep output usable for beginners while retaining the technical trail experts need.

## Workflow

### 1. Identify The Change Target

Capture:

- What is changing.
- Why it is changing.
- Who or what depends on it.
- Whether the change is code, data, UX, configuration, process, documentation, or policy.

If the user gives only a broad idea, inspect the repo and ask for the smallest missing decision needed to analyze impact.

### 2. Confirm MAP Context

Use the current SEAL map or refresh it if needed:

```bash
seal repo map <directory>
seal validate <directory>
```

When `.seal/map.yaml` exists, use it as the starting point for affected components, files, dependencies, tests, and gaps. If no map exists, perform direct repo inspection and say that impact is based on inspection rather than a generated MAP artifact.

### 3. Generate Or Draft The IMPACT Record

Use the supported command when creating an artifact:

```bash
seal impact <directory> <target> [summary]
```

The impact record should connect the target to:

- Affected components and files.
- Affected users, operators, data, APIs, workflows, or contracts.
- Required tests and manual checks.
- Proof obligations.
- Launch gates.
- Open gaps and unresolved authority.

### 4. Analyze Risk

Classify risk in plain terms:

- User risk: lost work, confusion, degraded workflow, accessibility, support burden.
- Technical risk: broken contracts, stale schema, dependency drift, concurrency, migration, rollback.
- Operational risk: deployment order, monitoring, documentation, ownership, training.
- Evidence risk: missing tests, unsupported claims, stale artifacts, unclear authority.

Tie every material risk to source authority or mark it as an inference.

### 5. Define Proof Needed

For each affected area, name what would prove the change is safe enough:

- Automated tests.
- Manual workflow checks.
- Evidence files or logs.
- Reviewer signoff.
- Metrics or monitoring.
- Migration validation or rollback proof.
- Documentation updates.

Do not mark proof as complete unless evidence is linked or observed.

## Output Format

Use this structure unless the user requests another format:

```markdown
## SEAL Impact

### Change Target
The file, component, feature, workflow, or decision being analyzed.

### Source Authority
Map artifacts, files, docs, tests, issues, plans, or user statements used as evidence.

### Affected Areas
Components, files, users, dependencies, data, APIs, tests, docs, and operations.

### Risks
Confirmed risks, inferred risks, and unknown risks.

### Proof Needed
Evidence required before the change can be trusted.

### Gaps
Missing authority, stale references, absent tests, and unresolved decisions.

### Recommended Next Actions
The shortest path to reduce risk and prepare implementation or launch.
```

## User Modes

- Beginner: explain impact as "what this change touches and what could go wrong".
- Builder: provide edit surfaces, test commands, dependency checks, and implementation sequence.
- Reviewer: focus on hidden risk, stale proof, unverified assumptions, and launch blockers.
- Expert: include artifact ids, source links, schema references, and validation command results.

## Handoff

End with a clear readiness statement: safe to proceed, proceed with named proof gaps, or blocked until specific authority is supplied.
