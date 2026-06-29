# SEAL Gate Policy Engine

The gate policy engine turns SEAL artifacts into explicit movement decisions. It consumes validation diagnostics, MAP records, IMPACT records, PROOF claims and gaps, evidence records, and launch report records.

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
