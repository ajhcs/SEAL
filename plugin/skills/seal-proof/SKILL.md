---
name: seal-proof
description: Build SEAL proof for claims, evidence, gaps, validation, gates, and launch readiness. Use when the user asks to prove work is done, validate readiness, review evidence, expose unsupported claims, prepare a proof gap report, or decide whether something can launch.
---

# SEAL Proof

Use SEAL Proof to decide what is actually supported by evidence. The answer should make it clear which claims are proven, which are unsupported, which gates are blocked, and what evidence is still needed.

## Operating Rules

- Inspect MAP, IMPACT, PROOF, evidence, tests, docs, and validation output before making a proof claim.
- Treat proof as linked evidence, not confidence language.
- Ask only for missing evidence authority or launch decision authority after inspection.
- Separate proven claims, unsupported claims, failed checks, stale evidence, and accepted gaps.
- Do not call a checklist "proof" unless it points to evidence that can be inspected.
- Keep launch decisions understandable to non-technical users while preserving evidence links for experts.

## Workflow

### 1. Identify The Claims

Capture what the user wants proven:

- A feature works.
- A launch is ready.
- A risk is addressed.
- A test or validation gate passed.
- A plan requirement was implemented.
- A claim in `.seal/proof.yaml` is backed by evidence.

If claims are not explicit, inspect the plan, map, impact records, tests, and reports to derive the claim set. Mark derived claims as inferred.

### 2. Inspect Evidence

Look for:

- `.seal/proof.yaml`
- `.seal/evidence/index.yaml`
- `.seal/impacts/IMPACT-*.yaml`
- `.seal/map.yaml`
- `.seal/reports/proof-gaps.md`
- `.seal/reports/launch-readiness.md`
- Test output, CI logs, screenshots, docs, review records, or manual validation notes.

Use source files and actual command output over summaries when available.

### 3. Generate Or Refresh Proof

Use supported commands when artifact generation is requested or required:

```bash
seal proof <directory>
seal launch <directory>
seal validate <directory>
```

Use `seal proof` for proof gap reporting, `seal launch` for launch readiness, and `seal validate` for artifact shape and reference integrity. Do not claim any of these passed unless they ran.

### 4. Classify Each Claim

Classify claims as:

- Proven: evidence exists, is relevant, and can be inspected.
- Partially proven: some evidence exists but scope is incomplete.
- Unsupported: claim has no linked evidence.
- Failed: evidence or validation contradicts the claim.
- Stale: evidence exists but no longer matches the current map, impact, code, or plan.
- Accepted gap: an authorized decision allows launch despite a known gap.

Name the source authority for every classification.

### 5. Decide Readiness

Translate proof into a launch decision:

- Ready: all required claims are proven and gates pass.
- Ready with accepted gaps: gaps are explicit and accepted by the right authority.
- Not ready: required proof is missing, failed, stale, or blocked.
- Cannot determine: source authority is insufficient.

Prefer conservative readiness when evidence is incomplete.

## Output Format

Use this structure unless the user requests another format:

```markdown
## SEAL Proof

### Decision
Ready, ready with accepted gaps, not ready, or cannot determine.

### Source Authority
Artifacts, files, commands, tests, docs, and user statements inspected.

### Proven
Claims with inspectable evidence.

### Unsupported Or Stale
Claims that lack evidence, have weak evidence, or no longer match the current work.

### Failed Or Blocked
Validation failures, missing references, failed gates, or blocked evidence.

### Evidence
Evidence links, paths, command results, and review records.

### Launch Gates
Gate status and what each gate needs.

### Next Actions
Specific work needed to close proof gaps.
```

## User Modes

- Beginner: explain proof as "what evidence shows this is true".
- Builder: include tests, commands, artifacts, files, and exact missing evidence.
- Reviewer: highlight unsupported claims, stale evidence, and launch blockers first.
- Expert: include artifact ids, reference integrity, schema validation, and gate taxonomy.

## Handoff

End with what is proven, what blocks launch, which command results were used, and what the next session should inspect or generate.
