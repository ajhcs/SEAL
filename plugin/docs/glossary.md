# SEAL Plain-Language Glossary

SEAL keeps rigorous artifact names for files and validation, but public workflow copy should start with plain labels and direct questions. Use the internal term when writing `.seal` records, then pair it with beginner-safe wording in prompts, reports, and examples.

| Internal term | Plain label | User-facing question | Deeper meaning |
| --- | --- | --- | --- |
| MAP | What exists | What parts, files, and decisions can SEAL actually see? | The inventory of components, files, relationships, source authority, and visible unknowns. |
| IMPACT | What changes | If this file or decision changes, what else could move? | A scoped record of affected files, requirements, proof claims, tests, risks, gates, and gaps. |
| PROVE | What would prove it | What evidence would show this works? | Claim, evidence, and gap records that separate support from missing proof. |
| Source authority | Where this came from | Which file, plan, command, or person supports this? | The cited origin and confidence level behind an artifact field or claim. |
| Traceability | Why this is connected | What connects this file, decision, claim, and test? | Links between artifacts so a launch decision can be followed back to evidence. |
| Requirement | What must be true | What does the system need to do or avoid? | A required behavior, constraint, or acceptance condition from an authoritative source. |
| Assumption | What we are guessing | What are we treating as true without enough support yet? | A statement that needs review before it can become trusted authority. |
| Evidence | What supports it | What observed fact backs this claim? | A file, command result, test output, review note, or source record with provenance. |
| Gap or unknown | What is missing | What can SEAL not prove or map yet? | A visible missing link, weak source, unmapped file, or unresolved decision. |
| Validation | Artifact check | Are the SEAL files shaped correctly and linked to real files? | Schema, reference, file coverage, and source-authority checks. |
| Verification | Proof check | Did we show the claim is supported by evidence? | A claim-level review of evidence strength and remaining gaps. |
| Gate | Decision check | Is this stage allowed to move forward? | A policy check with pass, warn, or block results tied to evidence and gaps. |
| Launch gate | Launch decision | Is this ready to ship, or what blocks it? | The final readiness decision across map, impact, proof, validation, and unresolved gaps. |
| Hazard or risk | What should never happen | What could harm users, data, trust, money, or operations? | A bad outcome that needs prevention, monitoring, mitigation, or explicit acceptance. |
| Claim | What we say is true | What are we asking someone to believe? | A statement that must link to evidence or a gap. |
| File coverage | Are all files accounted for | Is every non-ignored file mapped or named as a gap? | Coverage check proving repository contents are either owned by a component or visible as debt. |
| Reference integrity | Do the links work | Do artifact ids and file paths point to things that exist? | Cross-artifact consistency so reports do not rely on broken references. |

## Starter Questions

Use these questions before specialist wording:

- Who is this for?
- What should never happen?
- What would prove this worked?
- Can users lose work here?
- Which file, plan, command, or person says this is true?
- What is missing before this can launch?

## UX Copy Map

- Beginner repo request: "Show what exists, what is unknown, and what blocks launch." Internally this runs inspect, initialize, ingest, MAP, render gaps, and validate.
- Impact request: "Show what changes and what needs new proof." Internally this writes an IMPACT record with affected artifacts, `proof_required`, `approval_needed`, and gaps.
- Proof request: "Show what would prove this worked and what is still missing." Internally this updates PROVE records as claims, evidence, and gaps.
- Artifact request: "Check whether the SEAL files are valid and connected." Internally this validates schemas, references, file coverage, and source authority.

## Example Public Output

```text
What exists: SEAL mapped 18 repository files and found 3 files that still need an owner.
What changes: Editing src/auth/login.mjs may affect the login component, two tests, and one launch decision.
What would prove it: The login claim has one passing test as evidence and one remaining gap for password reset behavior.
What blocks launch: The launch gate is blocked until unmapped files and missing proof are resolved or explicitly accepted.
```

Avoid unexplained acronyms such as RTM, V&V, or FMEA in public output. If an expert term is necessary, put the plain label first and the deeper term second.
