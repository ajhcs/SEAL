# SEAL Gate Policy Engine

The gate policy engine turns SEAL artifacts into explicit movement decisions. It consumes validation diagnostics, MAP records, IMPACT records, PROOF claims and gaps, evidence records, and launch report records.

Gate decisions run under a rigor profile:

| Profile | Use | Extra policy |
| --- | --- | --- |
| `explore` | Early discovery. | Keep unknowns and weak evidence visible without making launch claims. |
| `standard` | Default delivery. | Require linked evidence or explicit proof gaps while preserving cautions. |
| `launch` | Release readiness. | Require impact records, proof coverage, and launch-owner review paths. |
| `mission-critical` | Explicit high-assurance work. | Require current passed evidence, no accepted proof gaps, and independent approval. |

`mission-critical` is opt-in unless the user, artifacts, config, or command flag explicitly declares mission-critical, safety-critical, life-safety, or regulated medical scope. High-consequence wording such as payment, privacy, security, or data loss recommends escalation to `launch`; it does not silently select `mission-critical`.

Policy output uses five statuses:

| Status | Meaning |
| --- | --- |
| `pass` | The gate has no active blocker, warning, or unknown in the supplied artifacts. |
| `fail` | A hard rule is violated, such as invalid schemas, broken references, hidden gaps, failed evidence, or unmapped launch files. |
| `warn` | Work may continue, but a visible caution remains, such as low confidence, stale evidence, pending approval, or weak authority. |
| `blocked` | A required proof obligation or approval remains open before launch. |
| `unknown` | The artifacts expose an unresolved impact area or gap that needs inspection or evidence. |

Every non-pass decision must include artifact references. A gate report is valid only when a reader can trace each decision back to the artifact, diagnostic, claim, evidence record, or gap that caused it.

Overall status uses the most conservative active decision:

`fail` > `blocked` > `unknown` > `warn` > `pass`

This keeps early discovery permissive while making launch conservative. Unknowns and accepted gaps can be documented, but they cannot be treated as proof.
