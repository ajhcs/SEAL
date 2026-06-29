# SEAL And gstack

SEAL treats gstack as a useful plan-generation complement. gstack can help a user produce a structured plan quickly; SEAL helps that plan become maintainable, inspectable, and launchable over time.

## Positioning

- gstack helps create or organize a plan.
- SEAL preserves the plan as source authority, then adds MAP, IMPACT, PROVE, validation, and launch readiness artifacts.
- SEAL does not attack, replace, or depend on gstack.
- SEAL should accept gstack-style Markdown without assuming one exact output format.

## Import Assumptions

SEAL can start from a Markdown file that includes some mix of:

- goals, scope, requirements, or feature lists;
- architecture, component, file, or implementation notes;
- risks, assumptions, open questions, and constraints;
- milestones, phases, validation steps, acceptance criteria, or launch gates;
- generated recommendations that still need human review.

Every imported statement remains tied to the original plan source. Anything inferred from wording stays pending review and becomes visible as source authority, confidence, and gap data instead of hidden fact.

## Example Input Shape

```markdown
# Appointment Scheduler Launch Plan

## Product Goal
- Let staff collect and manage appointment requests.

## Implementation Plan
- Build request intake, staff review, email notification, and admin settings.

## Risks And Assumptions
- Assumption: staff roles already exist.
- Risk: email delivery can fail silently.

## Validation And Launch Gates
- Acceptance: users can submit a request with schema validation.
- Gate: launch only after proof claims link to passing test output.
```

## Conversion Story

- MAP: records the plan file as source authority, creates the starter planned-system component, extracts requirements, assumptions, risks, trace links, launch gates, and visible review gaps.
- IMPACT: starts with a safe initial change record, then a proposed change can link back to affected components, files, proof needs, and unresolved gaps.
- PROVE: converts launch and validation claims into proof claims that need evidence or explicit gaps.
- VALIDATE: checks schema validity, authority fields, reference integrity, and file coverage for generated artifacts.
- LAUNCH: reports whether the current evidence and gaps support a release decision.

## Import Report Expectations

A gstack-style import should explain:

- what was mapped directly from headings or bullets;
- what was inferred from plan wording;
- what still needs owner approval or clarification;
- which claims need test output, review notes, or launch approval;
- which terms were left unresolved because the input format was ambiguous.

## No-Attack Framing

SEAL should describe gstack output as a strong starting point when it exists. The comparison story is not "gstack versus SEAL"; it is "plan creation into plan maintenance, proof, and launch discipline."
