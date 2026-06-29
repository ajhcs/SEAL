# ChatGPT App Submission Readiness

This checklist keeps ChatGPT App submission separate from the current local Codex plugin path. SEAL can use it when the later App/MCP adapter work becomes active, but it must not be used to claim ChatGPT App availability today.

Submission readiness is blocked until SEAL has a working hosted MCP/App adapter. The current plugin is local-first, writes `.seal/` artifacts in the active workspace, and has no public MCP endpoint.

## Official Guidance Snapshot

Reviewed against OpenAI Apps SDK documentation on 2026-06-29:

- `https://developers.openai.com/apps-sdk/deploy/submission`
- `https://developers.openai.com/apps-sdk/app-submission-guidelines`
- `https://developers.openai.com/apps-sdk/guides/security-privacy`
- `https://developers.openai.com/apps-sdk/deploy/testing`
- `https://developers.openai.com/apps-sdk/build/auth`

Re-check these pages on submission day. App submission requirements are a moving contract, and the Dashboard flow is the submission authority.

## Current State

| Area | SEAL status | Submission meaning |
| --- | --- | --- |
| Codex plugin workflow | Ready for local scaffold testing through `npm run smoke:plugin` | Useful evidence, but not App submission proof |
| MCP tool contract | Drafted in `mcp-tool-contract.md` | Needs implemented hosted server |
| App output schemas | Drafted in `app-output-schemas.md` | Needs rendered ChatGPT UI validation |
| Security and privacy boundaries | Drafted in `adapter-security-privacy.md` | Needs policy URLs, retention decisions, and hosted review |
| Marketplace assets | Drafted in `marketplace-assets.md` | Needs official app metadata and screenshots from the real App |
| Publishing | Blocked by missing git remote in `seal-publish-remote` | Blocks ordinary release hygiene and public audit trail |

## Blocking Checklist

The team should not submit until every blocker below has an owner and evidence.

| Blocker | Needed evidence | Local bead or source |
| --- | --- | --- |
| Public MCP endpoint | Hosted HTTPS MCP server URL that OpenAI can connect to during review; no local or placeholder URL | `seal-epic-chatgpt-app-adapter` |
| Adapter implementation | MCP tools wrap current SEAL command/library surfaces with no app-only launch logic | `mcp-tool-contract.md` |
| ChatGPT UI | App widgets render MAP, IMPACT, PROVE, validation, context-pack, and launch-readiness summaries without exposing bulk source files | `app-output-schemas.md` |
| Developer Mode test evidence | Test prompts, expected responses, screenshots, and failure-path captures from the real ChatGPT App integration | future adapter test run |
| Organization verification | Verified individual or business publisher name in the OpenAI Platform Dashboard | human authority needed |
| App management permissions | `api.apps.write` for submission and `api.apps.read` for review status | human authority needed |
| Privacy policy URL | Public URL that discloses every user-related data type returned or stored by the adapter | `adapter-security-privacy.md` plus legal review |
| Support URL | Public support path for users and reviewers | human authority needed |
| Authentication decision | Either no auth with a clear reason, or OAuth flow with review-ready demo credentials and no MFA blocker | future adapter design |
| CSP | Exact resource and connection domains for widgets and server calls | future hosted app |
| Safety review | Tool annotations, destructive-action handling, prompt-injection tests, and clear error handling | future adapter test run |
| Version contract | Stable MCP metadata snapshot, release notes, and rollback path for server-only fixes | release owner |

## Submission Packet

Collect these artifacts before opening the Dashboard submission flow:

- App name, logo, short description, company URL, privacy policy URL, support URL, countries, localization notes, and screenshots.
- MCP server URL, tool list, output schema examples, widget screenshots, and CSP domains.
- Test prompts and expected responses for successful MAP, IMPACT, PROVE, validation, context-pack, and launch-readiness workflows.
- Failure-path examples for missing files, invalid artifacts, unsupported inputs, missing authority, and blocked launch readiness.
- Data inventory that maps every returned field to a purpose and shows that secrets, auth tokens, private keys, cookies, and unrelated source files are not returned.
- Authentication notes, OAuth credentials if used, demo account instructions if auth is required, and a statement that review credentials do not require MFA or extra human steps.
- Release notes explaining what changed since any previously submitted version.

## Review Risks

- SEAL currently has no hosted MCP endpoint, so OpenAI cannot connect to it for App review.
- SEAL currently has no ChatGPT App UI, so screenshots and Developer Mode proof would be speculative.
- The current product reads local repositories. The App adapter must make user consent, source scope, data retention, and returned data visible before review.
- Any write-capable adapter feature must preserve dry-run behavior or require explicit human confirmation before irreversible actions.
- The privacy policy must match actual adapter responses, including nested diagnostic fields and debug payloads.
- Published app metadata is a versioned contract. Server-only changes must preserve the submitted contract or go through a new version review.

## Local Evidence Commands

These commands prove the local plugin surface that the future adapter should wrap:

```bash
npm run smoke:plugin
node src/cli/seal-invoke.mjs tests/fixtures/markdown-plans/gstack-style.md
node src/cli/seal-context-pack.mjs tests/fixtures/full-workflow/pass src/app.mjs "Prepare implementation context."
node src/cli/seal-launch-report.mjs tests/fixtures/full-workflow/pass
node src/cli/seal-validate.mjs plugin/fixtures/minimal
```

Passing these commands does not prove App submission readiness. It proves only that the local Codex plugin workflow remains healthy.

## Non-Claims

Do not claim:

- ChatGPT App availability.
- OpenAI marketplace or directory installation.
- Remote publishing.
- OpenAI review approval.
- Replacement of human launch approval.
- Privacy or security approval before legal and hosted-adapter review.
