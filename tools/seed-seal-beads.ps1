$ErrorActionPreference = 'Stop'

function New-BeadDescription {
    param(
        [string]$Background,
        [string]$Approach,
        [string]$Success,
        [string]$Tests,
        [string]$Considerations
    )

@"
## Background
$Background

## Technical Approach
$Approach

## Success Criteria
$Success

## Test Plan
$Tests

## Considerations
$Considerations
"@
}

function Get-ExistingBeadIds {
    $ids = @{}
    $raw = & bd list --all --limit 0 --json
    if ($LASTEXITCODE -ne 0) {
        throw 'bd list failed while reading existing bead IDs.'
    }

    $items = $raw | ConvertFrom-Json
    foreach ($item in $items) {
        $ids[$item.id] = $true
    }
    return $ids
}

function Add-SealBead {
    param(
        [hashtable]$ExistingIds,
        [string]$Id,
        [string]$Title,
        [string]$Type,
        [string]$Priority,
        [string]$Parent,
        [string]$Labels,
        [string]$Background,
        [string]$Approach,
        [string]$Success,
        [string]$Tests,
        [string]$Considerations
    )

    $description = New-BeadDescription `
        -Background $Background `
        -Approach $Approach `
        -Success $Success `
        -Tests $Tests `
        -Considerations $Considerations

    if ($ExistingIds.ContainsKey($Id)) {
        $bdArgs = @(
            'update', $Id,
            '--title', $Title,
            '--type', $Type,
            '--priority', $Priority,
            '--description', $description
        )

        if ($Labels) {
            $bdArgs += @('--set-labels', $Labels)
        }

        & bd @bdArgs | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "bd update failed for $Id"
        }

        Write-Host "updated $Id"
        return
    }

    $bdArgs = @(
        'create', $Title,
        '--id', $Id,
        '-t', $Type,
        '-p', $Priority,
        '--description', $description
    )

    if ($Labels) {
        $bdArgs += @('-l', $Labels)
    }

    & bd @bdArgs | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "bd create failed for $Id"
    }

    $ExistingIds[$Id] = $true
    Write-Host "created $Id"
}

function Set-SealParent {
    param(
        [string]$Id,
        [string]$Parent
    )

    if (-not $Parent) {
        return
    }

    & bd update $Id --parent $Parent | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "bd update --parent failed for $Id -> $Parent"
    }

    Write-Host "parent $Id -> $Parent"
}

function Add-SealDependency {
    param(
        [string]$Blocked,
        [string]$Blocker
    )

    $output = & bd dep add $Blocked $Blocker 2>&1
    if ($LASTEXITCODE -ne 0) {
        $text = ($output | Out-String)
        if ($text -match 'already|exists|duplicate|UNIQUE constraint|constraint failed') {
            Write-Host "skip existing dependency $Blocked <- $Blocker"
            return
        }
        throw "bd dep add failed for $Blocked depends on $Blocker`: $text"
    }

    Write-Host "dependency $Blocked <- $Blocker"
}

function Remove-SealDependency {
    param(
        [string]$Blocked,
        [string]$Blocker
    )

    $output = & bd dep remove $Blocked $Blocker 2>&1
    if ($LASTEXITCODE -ne 0) {
        $text = ($output | Out-String)
        if ($text -match 'not found|does not exist|doesn''t exist|no dependency|missing') {
            Write-Host "skip absent dependency $Blocked <- $Blocker"
            return
        }
        throw "bd dep remove failed for $Blocked depends on $Blocker`: $text"
    }

    Write-Host "removed dependency $Blocked <- $Blocker"
}

$existingIds = Get-ExistingBeadIds

$beads = @(
    @{
        Id='seal-epic-user-promise'; Title='Epic: Non-expert user promise and product shape'; Type='epic'; Priority='P0'; Parent=''; Labels='epic,product,non-expert,gstack-parity';
        Background='SEAL must be approachable for users who are not systems engineers. The P0 promise is that a user can install the Codex plugin, initialize .seal, ingest a plan or existing repo, map the system, analyze impact, attach proof, and get a launch/readiness report.';
        Approach='Define the smallest usable product contract around MAP, IMPACT, and PROVE. Treat gstack usability as the baseline for approachability and SEAL rigor as the differentiator, while keeping persona polish from blocking the engine.';
        Success='The repository has a one-page product contract, beginner vocabulary, and first-run workflow that explain the golden path: initialize, ingest, map, impact, prove, validate, and launch report.';
        Tests='Review the brief against a gstack-style plan, a hand-written Markdown plan, and an existing code project. Confirm each can be explained without systems-engineering jargon.';
        Considerations='Use the safer promises: zero hidden technical debt, no untraced rework, disciplined traceability, explicit assumptions, and evidence-backed launch readiness.'
    },
    @{
        Id='seal-user-personas'; Title='Define non-expert personas and guided jobs-to-be-done'; Type='task'; Priority='P1'; Parent='seal-epic-user-promise'; Labels='product,ux,personas';
        Background='The plugin needs to serve planners, founders, product builders, and developers who may not know systems-engineering terminology but still need rigorous plans, traceability, and release discipline.';
        Approach='Write the primary personas, their inputs, their fears, their expected outputs, and the exact guided jobs SEAL should support. Include one persona that starts from gstack output and one that starts from an existing repo.';
        Success='A checked-in product note names the first personas, top workflows, non-goals, and terminology that should be hidden from or explained to beginners.';
        Tests='Walk through each persona and verify the first-run command can be described in one sentence using plain language.';
        Considerations='Do not let systems-engineering vocabulary become the product surface unless paired with plain-language explanations.'
    },
    @{
        Id='seal-product-positioning'; Title='Write the P0 product contract for MAP, IMPACT, and PROVE'; Type='task'; Priority='P0'; Parent='seal-epic-user-promise'; Labels='product,copy,marketplace,p0-lite';
        Background='The current plan positions SEAL as systems-engineering rigor for Codex, but P0 positioning must be a precise product contract, not polished launch copy.';
        Approach='Draft a one-page contract that says SEAL maps repos and plans, exposes unknowns and hidden debt, analyzes proposed changes, and ties claims to evidence or gaps. Replace brittle claims with zero hidden technical debt and no untraced rework.';
        Success='The repo contains a product contract that says who SEAL is for, what input it accepts, what output it produces, and why it complements or upgrades gstack-style planning.';
        Tests='Read the copy as a non-expert and confirm it answers: what do I give it, what do I get back, and why should I trust it.';
        Considerations='Keep Codex plugin language primary. ChatGPT App language should be framed as a later adapter unless implementation changes.'
    },
    @{
        Id='seal-product-gstack-bridge'; Title='Define the gstack bridge and comparison story'; Type='task'; Priority='P1'; Parent='seal-epic-user-promise'; Labels='product,gstack,interop';
        Background='SEAL should be as usable as gstack while helping users maintain, improve, and launch plans with systems-engineering rigor.';
        Approach='Document how SEAL compares to gstack, what gstack artifacts it can ingest, and the user story for moving from gstack plan creation into SEAL maintenance and launch readiness.';
        Success='A comparison note exists with positioning, import assumptions, example inputs, and a clear no-attack framing that treats gstack as a plan-generation complement.';
        Tests='Use one representative gstack-style plan and verify the note identifies how SEAL would convert it into map, spec, trace, proof, and gate artifacts.';
        Considerations='Avoid overfitting to one exact gstack output format until sample artifacts are collected.'
    },
    @{
        Id='seal-product-glossary'; Title='Create plain-language systems-engineering glossary and UX copy map'; Type='task'; Priority='P0'; Parent='seal-epic-user-promise'; Labels='docs,ux,terminology,p0-lite';
        Background='Terms like traceability, gates, hazards, validation, and verification are valuable but can intimidate non-expert users.';
        Approach='Build a glossary that maps expert terms to short plain-language labels and question phrasing. Use questions like who is this for, what should never happen, what would prove this worked, and can users lose work here.';
        Success='A glossary file exists and every public-facing workflow uses beginner-safe language while preserving rigorous internal artifact names.';
        Tests='Sample generated output should include plain labels and optional deeper definitions, not unexplained acronyms or requirements-engineering prompts.';
        Considerations='The glossary should become a lint target later, but the first pass can be documentation and examples.'
    },

    @{
        Id='seal-epic-codex-plugin-core'; Title='Epic: Installable Codex plugin core'; Type='epic'; Priority='P0'; Parent=''; Labels='epic,codex,plugin';
        Background='SEAL is intended to be used and advertised primarily as a Codex plugin. The core deliverable is an installable plugin with real skill entrypoints, clear metadata, and local smoke tests.';
        Approach='Bring the extracted plugin plan into the workspace, align it with current Codex plugin mechanics, implement the actual invocation surface, and prove it loads locally.';
        Success='A user can install or load the plugin in Codex, invoke the SEAL workflow from a plan or repo, and receive a valid artifact set with beginner-oriented guidance.';
        Tests='Run a local plugin load smoke, invoke the main workflow on fixtures, and validate generated artifacts.';
        Considerations='Do not promise slash commands unless the implemented Codex surface actually supports them. Prefer skill-based entrypoints if that is the reliable plugin mechanism.'
    },
    @{
        Id='seal-plugin-repo-scaffold'; Title='Materialize the plugin skeleton in the SEAL workspace'; Type='task'; Priority='P0'; Parent='seal-epic-codex-plugin-core'; Labels='repo,plugin,scaffold';
        Background='The current workspace was empty before Beads initialization. The planned plugin files need to be copied or reconstructed into this repo before implementation can proceed.';
        Approach='Move the relevant plan archive contents into the workspace with a clean repository layout, preserving only files that belong to the plugin product.';
        Success='The repo has a clear plugin root, skill files, schemas, tests, fixtures, docs, and package metadata with no stray temp extraction paths.';
        Tests='Run a tree inspection and verify expected top-level directories exist and no generated junk or personal paths are committed.';
        Considerations='Keep this scoped to materializing the product skeleton. Do not refactor implementation details before the files are under version control.'
    },
    @{
        Id='seal-plugin-manifest'; Title='Align Codex plugin manifest and marketplace metadata'; Type='task'; Priority='P0'; Parent='seal-epic-codex-plugin-core'; Labels='plugin,manifest,marketplace';
        Background='Plugin distribution depends on metadata that accurately describes entrypoints, permissions, skills, versioning, and intended usage.';
        Approach='Review plugin metadata, README install steps, marketplace copy, version fields, and skill references against the current OpenAI plugin and Codex documentation.';
        Success='Plugin metadata is internally consistent, references real files, and clearly positions SEAL as a Codex plugin for plan-to-launch rigor.';
        Tests='Run any available manifest validation and manually inspect paths referenced by the metadata.';
        Considerations='Treat ChatGPT App submission metadata as separate from the Codex plugin manifest unless the architecture explicitly supports both.'
    },
    @{
        Id='seal-plugin-invocation'; Title='Implement the real SEAL invocation surface in Codex'; Type='task'; Priority='P0'; Parent='seal-epic-codex-plugin-core'; Labels='plugin,codex,entrypoint';
        Background='The earlier plan referenced slash commands, but that claim needs to be replaced or implemented using the actual Codex plugin mechanism.';
        Approach='Define the canonical invocation path, likely a skill entrypoint, with commands or prompts that accept a plan file, gstack output, or repo path and route to the workflow.';
        Success='The documented invocation works in Codex and does not mention unsupported command surfaces.';
        Tests='Invoke the plugin locally on a minimal Markdown plan and confirm the expected artifact creation flow starts.';
        Considerations='Favor a dependable explicit workflow over clever command aliases. Non-expert users should not need to know internal file names.'
    },
    @{
        Id='seal-plugin-skill-routing'; Title='Harden skill routing for beginner and advanced modes'; Type='task'; Priority='P0'; Parent='seal-epic-codex-plugin-core'; Labels='skills,workflow,ux,p0-lite';
        Background='SEAL should guide non-experts while still allowing advanced users to work directly with artifacts and validators.';
        Approach='Create or refine skill instructions that inspect first, infer cautiously, and ask only for authority gaps. Route beginner requests through guided MAP, IMPACT, and PROVE steps, while advanced users can operate directly on artifacts.';
        Success='A non-expert can ask "Use SEAL to map this repo and tell me what is unknown" and receive the golden path without learning requirements-engineering terms.';
        Tests='Use scripted prompt examples to confirm the correct mode is selected for a vague beginner request, an existing-repo request, and a precise expert request.';
        Considerations='Mode selection should reduce friction, not create a long questionnaire before useful work happens.'
    },
    @{
        Id='seal-context-pack-builder'; Title='Build task-focused context packs for Codex'; Type='task'; Priority='P0'; Parent='seal-epic-codex-plugin-core'; Labels='context,codex,llm,workflow';
        Background='SEAL should help Codex work from the right evidence without loading the entire repo or drifting away from approved artifacts.';
        Approach='Build compact context packs from .seal/map.yaml, impact records, proof gaps, source authority, and relevant files. Include only the artifacts, file summaries, unknowns, and gates needed for the current task.';
        Success='Given a proposed change, SEAL can produce a small context pack that names the relevant components, files, interfaces, tests, claims, evidence, and unknowns.';
        Tests='Run context-pack generation on fixture repos and verify it includes expected relevant records while excluding unrelated files.';
        Considerations='Context packs should preserve source authority and confidence markers so inferred records do not become baseline truth.'
    },
    @{
        Id='seal-plugin-smoke'; Title='Add local Codex plugin load and workflow smoke test'; Type='task'; Priority='P0'; Parent='seal-epic-codex-plugin-core'; Labels='test,codex,smoke';
        Background='A plugin intended for Codex must have a repeatable local smoke test that proves installation, loading, invocation, and basic artifact generation.';
        Approach='Document and automate the shortest possible local smoke path. It should cover plugin discovery, main entrypoint invocation, fixture input, generated artifact output, and validation.';
        Success='A contributor can run one documented smoke procedure and know whether the plugin is usable in Codex.';
        Tests='Run the smoke test from a clean clone or clean working tree after plugin files exist.';
        Considerations='Record any manual Codex UI steps separately from automated checks so failures are diagnosable.'
    },

    @{
        Id='seal-epic-artifact-model'; Title='Epic: SEAL artifact model, schemas, and migrations'; Type='epic'; Priority='P0'; Parent=''; Labels='epic,schemas,artifacts';
        Background='SEAL needs durable artifacts that survive beyond a single agent session and directly support the three product engines: MAP, IMPACT, and PROVE.';
        Approach='Make the .seal artifact model explicit, schema-backed, source-authority-aware, and easy for Codex to generate and validate. Center P0 on .seal/map.yaml, .seal/impacts/IMPACT-*.yaml, .seal/proof.yaml, and .seal/evidence/.';
        Success='The artifact set has authoritative schemas, templates, reference integrity rules, source authority, and examples that support ingestion, repo mapping, impact analysis, proof gates, and launch reports.';
        Tests='Validate generated fixtures and confirm cross-file references are checked.';
        Considerations='Avoid schema sprawl. Start with the minimum model needed for traceability, proof, and launch readiness.'
    },
    @{
        Id='seal-artifact-schema-pass'; Title='Make artifact schemas authoritative and wired into generation'; Type='task'; Priority='P0'; Parent='seal-epic-artifact-model'; Labels='schemas,artifacts,validation';
        Background='The validator and generators need one source of truth for artifact structure. Weak schemas make the rigor claim unverifiable.';
        Approach='Define JSON Schema or equivalent structured schemas for each artifact type and ensure generation code writes data that conforms to them.';
        Success='Every generated artifact has an authoritative schema and the generator cannot silently produce invalid structure.';
        Tests='Run schema validation against passing and failing fixtures.';
        Considerations='Use structured parsers and validators rather than ad hoc string checks.'
    },
    @{
        Id='seal-artifact-id-ref-model'; Title='Define stable IDs and cross-artifact reference integrity'; Type='task'; Priority='P0'; Parent='seal-epic-artifact-model'; Labels='traceability,ids,schemas';
        Background='Systems-engineering value depends on traceability. Requirements, components, evidence, risks, and gates need stable IDs and checked references.';
        Approach='Specify ID formats, ownership, allowed reference types, and integrity rules across map, spec, trace, proof, risk, and gate files.';
        Success='A reference model document and validator rules prevent dangling IDs, duplicate IDs, and invalid trace link types.';
        Tests='Create fixtures with duplicate IDs, missing refs, and invalid link types and confirm validation fails with actionable messages.';
        Considerations='IDs should be readable enough for humans but stable enough for automation.'
    },
    @{
        Id='seal-authority-source-registry'; Title='Define source authority registry and artifact trust states'; Type='task'; Priority='P0'; Parent='seal-epic-artifact-model'; Labels='authority,sources,trust,schemas';
        Background='SEAL must distinguish human-approved facts, external authoritative sources, repo observations, execution evidence, mathematical or code proof, LLM inference, and unknowns.';
        Approach='Define .seal/sources.yaml or equivalent source registry plus shared fields: source_refs, authority_state, approval_state, and confidence. Ensure meaningful artifacts can cite sources and cannot treat inference as approved baseline truth.';
        Success='Every meaningful artifact record can carry source_refs, authority_state, approval_state, and confidence, with allowed states such as human_approved, repo_observed, externally_sourced, mathematically_proven, inferred, and unknown.';
        Tests='Create fixtures for each source type and verify validation fails when an approved baseline record has only inferred or unknown authority.';
        Considerations='Keep drafts flexible. The hard rule is that LLM-inferred records may guide investigation but cannot become baseline truth without source authority.'
    },
    @{
        Id='seal-artifact-templates'; Title='Create beginner-safe MAP, IMPACT, and PROOF templates'; Type='task'; Priority='P0'; Parent='seal-epic-artifact-model'; Labels='templates,docs,non-expert,p0-lite';
        Background='Non-expert users need generated artifacts that are useful immediately and do not expose empty intimidating structures.';
        Approach='Build templates for .seal/map.yaml, .seal/impacts/IMPACT-*.yaml, .seal/proof.yaml, .seal/evidence/index.yaml, and gap/debt records with starter sections, plain-language labels, and examples.';
        Success='The first generated .seal folder is complete, readable, includes MAP/IMPACT/PROOF scaffolding, and is ready for iterative refinement.';
        Tests='Generate artifacts from a one-page plan and inspect whether each file has meaningful initial content.';
        Considerations='Templates should not hide uncertainty. Unknowns should be recorded as assumptions or gaps.'
    },
    @{
        Id='seal-artifact-migrations'; Title='Add artifact versioning and migration policy'; Type='task'; Priority='P2'; Parent='seal-epic-artifact-model'; Labels='versioning,migrations,maintenance';
        Background='SEAL artifacts will evolve. Existing projects need a safe way to upgrade without losing traceability.';
        Approach='Add artifact version metadata, compatibility checks, and a documented migration policy. Implement the first no-op migration path if needed.';
        Success='The validator can detect artifact version mismatches and tell users how to upgrade.';
        Tests='Run validation on current-version and old-version fixture folders.';
        Considerations='Keep migration tooling minimal until schema churn becomes real.'
    },

    @{
        Id='seal-epic-plan-ingestion'; Title='Epic: Guided plan and project ingestion'; Type='epic'; Priority='P0'; Parent=''; Labels='epic,ingestion,gstack,non-expert';
        Background='The first useful SEAL experience is converting an existing plan, gstack output, or code project into a rigorous but understandable artifact set.';
        Approach='Build ingestion workflows for both new projects and existing repos. Extract goals, constraints, assumptions, requirements, components, risks, proof needs, launch gates, and source-authority gaps from user-provided inputs and repo observation.';
        Success='A non-expert can point SEAL at a plan or repo and receive a usable first-pass systems map with clear gaps and next actions.';
        Tests='Run ingestion against representative Markdown, gstack-style, and existing-repo fixtures.';
        Considerations='The workflow should be transparent about inferred content and should separate user-provided facts from agent assumptions.'
    },
    @{
        Id='seal-ingest-markdown-plan'; Title='Implement Markdown plan ingestion'; Type='task'; Priority='P0'; Parent='seal-epic-plan-ingestion'; Labels='ingestion,markdown';
        Background='Many users will start with a free-form plan document. SEAL needs to turn that into structured artifacts without requiring a special template.';
        Approach='Parse headings, bullets, decisions, constraints, milestones, and acceptance criteria from Markdown. Map extracted content into artifacts with confidence and assumption annotations.';
        Success='A free-form Markdown plan produces initial map, spec, trace, risks, assumptions, and launch gates.';
        Tests='Use at least three Markdown fixtures: sparse, medium, and detailed.';
        Considerations='Do not invent certainty. Low-confidence extraction should become review items.'
    },
    @{
        Id='seal-ingest-gstack-output'; Title='Implement gstack-style plan ingestion'; Type='task'; Priority='P1'; Parent='seal-epic-plan-ingestion'; Labels='ingestion,gstack,interop';
        Background='The intended workflow includes plans created with gstack. SEAL should make those plans maintainable and launchable with added rigor.';
        Approach='Collect or define representative gstack-like sections and map them into SEAL artifacts. Preserve original plan intent while adding traceability, evidence needs, and launch gates.';
        Success='A gstack-style input can be converted into SEAL artifacts with a clear import report explaining what was mapped, inferred, or left unresolved.';
        Tests='Run import fixtures and compare the output to expected artifact snapshots.';
        Considerations='If exact gstack formats vary, start with a tolerant Markdown importer plus named gstack heuristics.'
    },
    @{
        Id='seal-ingest-existing-project'; Title='Implement existing project ingestion from a repo path'; Type='task'; Priority='P0'; Parent='seal-epic-plan-ingestion'; Labels='ingestion,repo,codebase';
        Background='Most users will arrive with an existing project and ask what is going on. Existing-project ingestion is core to the product promise, not a later adapter.';
        Approach='Inventory the repository, classify every file, identify likely entrypoints and modules, and create a first-pass map with unknowns, proof gaps, and authority gaps.';
        Success='Pointing SEAL at a repo produces .seal/map.yaml, an unknown/debt register, proof gaps, and a validation plan that distinguish observed facts from inference.';
        Tests='Use at least one tiny app fixture and one multi-directory fixture, and verify every non-ignored file is classified or recorded as unknown.';
        Considerations='Separate static facts from inferred architecture. Never overstate understanding of business requirements recovered from code alone.'
    },
    @{
        Id='seal-ingest-gap-review'; Title='Generate an assumption and gap review after ingestion'; Type='task'; Priority='P0'; Parent='seal-epic-plan-ingestion'; Labels='ingestion,assumptions,review';
        Background='A non-expert user needs help seeing what is missing from a plan or project before launch work begins.';
        Approach='After ingestion, produce a concise review of missing requirements, unclear interfaces, unproven claims, unmanaged risks, and launch blockers.';
        Success='Every ingestion run ends with actionable gaps ranked by launch impact and confidence.';
        Tests='Use fixtures with intentionally missing constraints, unclear users, and absent test evidence.';
        Considerations='The review should guide next steps without shaming the user or drowning them in terminology.'
    },

    @{
        Id='seal-epic-repo-map-impact'; Title='Epic: Repository mapping and change impact analysis'; Type='epic'; Priority='P0'; Parent=''; Labels='epic,repo,map,impact';
        Background='SEAL should help users maintain and improve projects, not just create initial plans. Repo mapping and impact analysis are the product: users need to see what exists, what depends on what, what breaks when change happens, and what proof is required.';
        Approach='Build the P0 golden path around a fully visible repo map, explicit unknowns, rendered views, impact records, and proof obligations. Fully mapped means nothing is invisible: every non-ignored file is classified, mapped to a component or recorded as an unknown gap.';
        Success='Users can ask what a repo contains and what a change affects, then receive linked components, files, interfaces, tests, proof gaps, risks, and gates.';
        Tests='Run repo mapping and impact analysis on controlled fixture repos and fixture changes with known expected affected artifacts.';
        Considerations='Impact analysis should be conservative. Unknown impact is a valid result when evidence is missing, and unknowns must be visible.'
    },
    @{
        Id='seal-map-inventory-engine'; Title='Build repository inventory engine'; Type='task'; Priority='P0'; Parent='seal-epic-repo-map-impact'; Labels='repo,inventory,map';
        Background='SEAL needs a repeatable view of every non-ignored file, language, framework, test location, doc, asset, generated file, vendored file, migration, and likely runtime entrypoint.';
        Approach='Implement inventory using filesystem traversal, ignore rules, package metadata, and language-specific lightweight heuristics. Classify each file as product_code, test, config, build, script, documentation, artifact, generated, vendored, asset, migration, or unknown.';
        Success='The inventory writes .seal/map.yaml with 100 percent classification for non-ignored files and marks uncertain files as unknown instead of dropping them.';
        Tests='Run on fixture repos and verify ignored files, generated files, vendored files, assets, migrations, and test directories are classified correctly.';
        Considerations='Avoid expensive full parsing as the first step. Prefer useful coarse structure that can improve over time.'
    },
    @{
        Id='seal-map-component-classifier'; Title='Classify components and interfaces from repo evidence'; Type='task'; Priority='P0'; Parent='seal-epic-repo-map-impact'; Labels='repo,architecture,components';
        Background='A system map needs components, purposes, interfaces, dependencies, data stores, tests, and ownership boundaries that can be traced to files.';
        Approach='Use inventory output, package metadata, imports, route definitions, configuration, docs, and source authority to propose components and interfaces with confidence levels. Every non-generated, non-vendored file should have a purpose, owning component, dependencies or none, interfaces touched or none, tests/proof or gap, and authority marker.';
        Success='The system map links components to source files, owners/reasons for dependencies, data stores, tests, and explicit unknowns for anything not confidently mapped.';
        Tests='Compare classifier output for fixture projects against expected component maps and expected unknown records.';
        Considerations='Keep confidence and provenance visible so users can correct the map.'
    },
    @{
        Id='seal-unmapped-debt-register'; Title='Create unmapped and hidden-debt register'; Type='task'; Priority='P0'; Parent='seal-epic-repo-map-impact'; Labels='repo,debt,unknowns';
        Background='The safe promise is zero hidden technical debt, not zero technical debt. SEAL needs a visible register for gaps, orphan components, missing tests, stale artifacts, risky dependencies, and ambiguous ownership.';
        Approach='Write a structured register that records unmapped files, unknown owners, unlinked tests, missing evidence, stale artifacts, orphan components, risky dependencies, and ambiguous requirements with source refs and confidence.';
        Success='Every unmapped or uncertain repo finding is either resolved into the map or listed as a visible debt/unknown record with a reason and next action.';
        Tests='Run fixture repos with intentional orphan files, missing tests, stale docs, and ambiguous components and verify the register records them.';
        Considerations='Debt records should be actionable and non-punitive. The goal is to turn unknowns into known unknowns.'
    },
    @{
        Id='seal-map-rendered-views'; Title='Render Markdown and Mermaid system map views'; Type='task'; Priority='P0'; Parent='seal-epic-repo-map-impact'; Labels='map,markdown,mermaid,views';
        Background='Non-experts need to see the mapped repo as a visual and written system map, not only raw YAML.';
        Approach='Generate Markdown and Mermaid views from .seal/map.yaml showing components, file ownership, dependencies, interfaces, data stores, tests, and unknowns.';
        Success='A repo map run produces a readable Markdown report and Mermaid diagram that match the structured map and visibly include unknowns.';
        Tests='Render fixture maps and compare stable sections or snapshots for components, dependencies, and unknowns.';
        Considerations='Ship Mermaid and Markdown before any custom UI.'
    },
    @{
        Id='seal-impact-change-scope'; Title='Implement change impact analysis across artifacts'; Type='task'; Priority='P0'; Parent='seal-epic-repo-map-impact'; Labels='impact,traceability';
        Background='Users maintaining a project need to know what a proposed change affects before they edit blindly.';
        Approach='Given a changed file, requirement, component, interface, invariant, schema, dependency, data store, or gate, traverse trace links and repo mappings to identify affected artifacts and unknowns. Write .seal/impacts/IMPACT-*.yaml.';
        Success='Impact output lists affected requirements, components, files, interfaces, invariants, schemas, tests, services, dependencies, costs, proofs, risks, launch gates, and reasons.';
        Tests='Create fixture changes and assert expected affected IDs and unknown impact records.';
        Considerations='When trace links are incomplete, the output should say what evidence is missing instead of pretending confidence.'
    },
    @{
        Id='seal-impact-proof-obligations'; Title='Generate proof obligations from proposed changes'; Type='task'; Priority='P0'; Parent='seal-epic-repo-map-impact'; Labels='impact,proof,gates';
        Background='The maintenance value of SEAL comes from turning changes into concrete verification work.';
        Approach='Map impacted requirements and components to required evidence such as tests, repo execution, review notes, demos, measurements, external references, human approvals, or manual checks.';
        Success='Each impact analysis produces proof_required and approval_needed records that must be satisfied or explicitly gapped before launch gates pass.';
        Tests='Run on fixture changes that require unit tests, integration tests, docs updates, human approval, and manual validation.';
        Considerations='Proof obligations should be actionable and not simply restate that testing is needed.'
    },

    @{
        Id='seal-epic-proof-gates-launch'; Title='Epic: Proof, gates, and launch readiness'; Type='epic'; Priority='P0'; Parent=''; Labels='epic,proof,gates,launch';
        Background='SEAL differentiates itself by turning plans and projects into evidence-backed launch decisions. Proof and gates are the product core after ingestion.';
        Approach='Define claim types, evidence records, gate policies, and launch readiness reports that are understandable to beginners but rigorous enough for engineering decisions.';
        Success='A user can see what is proven, what is assumed, what is blocked, and what must happen before launch.';
        Tests='Run launch readiness on fixtures with passing, failing, and incomplete evidence.';
        Considerations='The system should make uncertainty visible. A red or blocked gate is a useful outcome.'
    },
    @{
        Id='seal-proof-claim-taxonomy'; Title='Define claim and evidence taxonomy'; Type='task'; Priority='P0'; Parent='seal-epic-proof-gates-launch'; Labels='proof,evidence,model';
        Background='Evidence-backed rigor requires a shared model of claims, evidence, confidence, and verification status.';
        Approach='Define claim types such as functional, safety, reliability, security, performance, usability, launch, and operational claims. Map each to accepted evidence types.';
        Success='The artifact model can represent claims and evidence in a way the validator and reports can reason about.';
        Tests='Create example proof records for each claim type and validate them.';
        Considerations='Keep the taxonomy small enough for non-expert users to understand.'
    },
    @{
        Id='seal-proof-evidence-store'; Title='Implement minimal proof evidence store'; Type='task'; Priority='P0'; Parent='seal-epic-proof-gates-launch'; Labels='proof,evidence,provenance';
        Background='A proof taxonomy without stored evidence becomes a checklist. SEAL needs the claim, evidence, and gap triad in P0 to honestly say it can prove a plan, change, or launch state.';
        Approach='Create .seal/proof.yaml, .seal/evidence/index.yaml, and .seal/evidence/files/. Evidence records should include id, type, claim_ids, source kind, command or source ref when relevant, captured_at, artifact_path, hash, status, and limitations.';
        Success='Every proof claim can link to supporting evidence or an explicit gap, and every evidence record preserves provenance, artifact location, and hash when applicable.';
        Tests='Record evidence from fixture test output, static inspection, external-source reference, and human approval examples, then validate claim links and file hashes.';
        Considerations='Do not store sensitive command output by default. Provide a redaction or summary path where needed.'
    },
    @{
        Id='seal-proof-gap-report'; Title='Generate proof gap report'; Type='task'; Priority='P0'; Parent='seal-epic-proof-gates-launch'; Labels='proof,gaps,report,ux';
        Background='Non-expert users need to know what is not proven and exactly what would close the gap.';
        Approach='Generate a human-readable report from .seal/proof.yaml and evidence records that lists unproven claims, missing evidence, stale evidence, low-confidence inference, and the next action to close each gap.';
        Success='A user can read one report and understand which claims are proven, which are assumed, which are blocked, and what evidence would make them launch-ready.';
        Tests='Run proof gap reporting on fixtures with supported claims, unsupported claims, stale evidence, and claims that intentionally remain open.';
        Considerations='The report should make uncertainty visible without shaming the user for having early-stage gaps.'
    },
    @{
        Id='seal-gate-entry-exit-criteria'; Title='Define entry and exit criteria for plan, build, prove, and launch'; Type='task'; Priority='P0'; Parent='seal-epic-proof-gates-launch'; Labels='gates,criteria,workflow';
        Background='SEAL needs clear movement rules so Codex and users know what must be true before progressing from plan to build to prove to launch.';
        Approach='Define hard-fail and warn criteria for each phase. P0 hard failures include invalid schemas, broken refs, claims with neither evidence nor gap, unmapped files in launch report, and launch artifacts that omit known unknowns.';
        Success='Gate criteria are explicit enough for a validator to enforce and plain enough for a non-expert to understand.';
        Tests='Evaluate fixtures where each hard-fail and warn condition is triggered exactly once.';
        Considerations='P0 gates should avoid over-blocking early exploration while being strict about false launch confidence.'
    },
    @{
        Id='seal-srl-levels'; Title='Add SEAL readiness levels after core gates'; Type='task'; Priority='P1'; Parent='seal-epic-proof-gates-launch'; Labels='readiness,srl,gates';
        Background='TRL or SRL-style levels can help users understand maturity, but only after the base gates and evidence model are working.';
        Approach='Define lightweight readiness levels that summarize artifact completeness, repo map coverage, proof strength, and launch gate state.';
        Success='Readiness levels provide a useful maturity summary without replacing concrete gate failures or proof gaps.';
        Tests='Score fixture projects at several maturity levels and confirm the score matches the underlying gate evidence.';
        Considerations='Keep readiness levels secondary to the actual evidence-backed gate report.'
    },
    @{
        Id='seal-gates-policy-engine'; Title='Implement launch gate policy evaluation'; Type='task'; Priority='P0'; Parent='seal-epic-proof-gates-launch'; Labels='gates,policy,launch';
        Background='Launch readiness needs explicit gates rather than vague confidence. Gates should explain pass, fail, blocked, and unknown states.';
        Approach='Implement policy evaluation from entry and exit criteria. Consume map coverage, impact records, proof claims, evidence, gaps, source authority, and risks. Fail hard for invalid schemas, broken refs, claims with neither evidence nor gap, unmapped launch files, and hidden unknowns.';
        Success='A gate report clearly states which gates pass, fail, warn, are blocked, or need more evidence, with every decision linked to artifacts.';
        Tests='Run policy evaluation on passing, failing, blocked, warning, and unknown fixtures.';
        Considerations='Gate defaults should be conservative for launch and permissive enough for early discovery.'
    },
    @{
        Id='seal-launch-readiness-report'; Title='Generate beginner-readable launch readiness report'; Type='task'; Priority='P0'; Parent='seal-epic-proof-gates-launch'; Labels='launch,report,ux';
        Background='The final output must help a non-expert decide what to do next without reading raw artifact files.';
        Approach='Generate a concise report with launch status, map coverage, unmapped debt, impact status, proof gaps, top blockers, high-risk assumptions, gate decisions, and next actions. Link every conclusion back to artifacts.';
        Success='The report is understandable on its own, traceable to structured evidence, and honest about unknowns rather than hiding them.';
        Tests='Compare generated reports for pass, fail, and incomplete fixture states.';
        Considerations='Avoid a wall of process language. The report should feel like a practical readiness decision.'
    },

    @{
        Id='seal-epic-validation-examples'; Title='Epic: Validation, fixtures, and regression safety'; Type='epic'; Priority='P0'; Parent=''; Labels='epic,validation,tests';
        Background='The earlier plan review found the validator too weak for the product claim. Validation must prove schemas, references, coverage, and reports are trustworthy.';
        Approach='Build a focused validation suite with passing and failing fixtures, CI checks, and useful error messages that non-experts can act on.';
        Success='Invalid artifacts fail loudly with actionable messages, and representative happy paths remain green in CI.';
        Tests='Run schema, reference, coverage, ingestion, and launch-readiness fixtures locally and in CI.';
        Considerations='Validation is both a technical guardrail and a user trust feature.'
    },
    @{
        Id='seal-validate-schema'; Title='Implement schema validation with actionable errors'; Type='task'; Priority='P0'; Parent='seal-epic-validation-examples'; Labels='validation,schemas';
        Background='Schema validation is the first guardrail against broken artifact generation.';
        Approach='Wire the artifact schemas into a validator command that reports file, path, expected shape, actual value, and suggested fix where practical.';
        Success='Invalid structure fails validation with messages a beginner can use.';
        Tests='Run validator against intentionally malformed fixtures.';
        Considerations='Do not expose raw validator internals as the only error message.'
    },
    @{
        Id='seal-validate-ref-integrity'; Title='Implement cross-artifact reference validation'; Type='task'; Priority='P0'; Parent='seal-epic-validation-examples'; Labels='validation,traceability,refs';
        Background='Traceability breaks when IDs are duplicated, missing, or linked with invalid relationship types.';
        Approach='Validate all IDs and references across the .seal folder and report dangling refs, duplicate IDs, invalid link types, and unreachable required artifacts.';
        Success='Reference problems are caught before launch reports or impact analysis trust them.';
        Tests='Run duplicate, dangling, invalid-type, and missing-file fixtures.';
        Considerations='Reference validation should run after schema validation so errors are easier to interpret.'
    },
    @{
        Id='seal-validate-file-coverage'; Title='Validate fully mapped repo coverage'; Type='task'; Priority='P0'; Parent='seal-epic-validation-examples'; Labels='validation,coverage,repo';
        Background='A project can look rigorous while major files or components remain unmapped. Coverage checks make blind spots visible.';
        Approach='Compare repository inventory to .seal/map.yaml and the debt register. Enforce 100 percent classification of non-ignored files, and require every non-generated, non-vendored file to map to a component or explicit unknown gap.';
        Success='Coverage validation reports mapped, unmapped, ignored, generated, vendored, and unknown areas, and launch gates fail when unmapped files are not visible as gaps.';
        Tests='Use fixture repos with known unmapped files and components.';
        Considerations='Fully mapped means nothing is invisible. It does not mean SEAL magically knows every answer.'
    },
    @{
        Id='seal-fixtures-pass-fail'; Title='Create pass and fail fixtures for the full workflow'; Type='task'; Priority='P0'; Parent='seal-epic-validation-examples'; Labels='fixtures,tests,examples';
        Background='Fixtures are needed for implementation safety, documentation, and user confidence.';
        Approach='Create small fixture inputs and expected outputs for the P0 golden path: initialize .seal, ingest a Markdown plan or existing repo, map, render views, analyze impact, create proof obligations, validate, and generate launch readiness.';
        Success='The test suite has compact fixtures that cover MAP, IMPACT, PROVE, launch reporting, and common failure modes.';
        Tests='Run all fixtures through the validator and snapshot or semantic assertions.';
        Considerations='Keep fixtures readable. They will double as examples for contributors and users.'
    },
    @{
        Id='seal-ci-smoke-suite'; Title='Add CI smoke suite for plugin and artifacts'; Type='task'; Priority='P1'; Parent='seal-epic-validation-examples'; Labels='ci,test,smoke';
        Background='The plugin needs regression protection before public distribution.';
        Approach='Configure CI to run linting, schema validation, fixture tests, and any plugin packaging checks that can run headlessly.';
        Success='A fresh pull request shows whether the core SEAL workflow still works.';
        Tests='Push a branch or run CI locally if supported and confirm expected checks pass.';
        Considerations='Keep CI fast. Deep evaluations or manual Codex UI checks can remain outside the headless suite.'
    },

    @{
        Id='seal-epic-chatgpt-app-adapter'; Title='Epic: Later ChatGPT App and MCP adapter'; Type='epic'; Priority='P2'; Parent=''; Labels='epic,chatgpt-app,mcp,later';
        Background='The user asked to consult ChatGPT App submission guidance, but the primary product is a Codex plugin. ChatGPT App work should be a later adapter, not the core path.';
        Approach='Design a clean adapter boundary where the same SEAL workflow can eventually expose MCP tools and App-friendly outputs without distorting the Codex plugin.';
        Success='There is a documented adapter plan, tool contract, privacy review, and submission readiness checklist gated behind a working Codex plugin.';
        Tests='Validate adapter contracts with mock inputs before building a submitted app.';
        Considerations='Do not spend implementation effort here until core plugin, artifacts, validation, and launch reports are usable.'
    },
    @{
        Id='seal-mcp-tool-design'; Title='Design MCP tool contract for SEAL workflows'; Type='task'; Priority='P2'; Parent='seal-epic-chatgpt-app-adapter'; Labels='mcp,design,adapter';
        Background='A future ChatGPT App or MCP integration needs stable tools that wrap SEAL workflows cleanly.';
        Approach='Define candidate tools such as ingest_plan, map_project, validate_artifacts, analyze_impact, and generate_launch_report with inputs, outputs, and error shapes.';
        Success='A tool contract document exists and maps each tool to existing Codex plugin workflow capabilities.';
        Tests='Review each tool against fixture workflows and confirm no extra app-only logic is required.';
        Considerations='Tool contracts should return structured data plus concise user-facing summaries.'
    },
    @{
        Id='seal-app-output-schemas'; Title='Define App-friendly output schemas and UI summaries'; Type='task'; Priority='P2'; Parent='seal-epic-chatgpt-app-adapter'; Labels='chatgpt-app,schemas,ux';
        Background='ChatGPT App outputs may need structured cards, reports, or summaries different from raw plugin artifacts.';
        Approach='Design output schemas that summarize launch state, blockers, gaps, and evidence links while preserving artifact references.';
        Success='Output schemas can present useful results without exposing unnecessary internal structure.';
        Tests='Render or inspect mock outputs for beginner readability and traceability.';
        Considerations='Keep these schemas derived from artifact state so the App adapter cannot drift from Codex behavior.'
    },
    @{
        Id='seal-app-submission-readiness'; Title='Create ChatGPT App submission readiness checklist'; Type='task'; Priority='P2'; Parent='seal-epic-chatgpt-app-adapter'; Labels='chatgpt-app,submission,checklist';
        Background='Submission requires product, privacy, support, and technical readiness beyond a working local plugin.';
        Approach='Create a checklist based on current OpenAI app submission guidance, including auth, data handling, safety, support URLs, testing, and review artifacts.';
        Success='The team can see what remains before attempting App submission and which items are blocked by core plugin work.';
        Tests='Review checklist against the current docs when this epic becomes active.';
        Considerations='This item is intentionally later because the Codex plugin path is the near-term distribution plan.'
    },
    @{
        Id='seal-adapter-security-privacy'; Title='Threat model adapter data handling and privacy'; Type='task'; Priority='P2'; Parent='seal-epic-chatgpt-app-adapter'; Labels='security,privacy,adapter';
        Background='SEAL may inspect project files, plans, evidence, and launch notes. Any app adapter needs clear data boundaries.';
        Approach='Document what data is read, stored, transmitted, redacted, and returned for future MCP or App flows.';
        Success='The adapter plan includes privacy and security constraints that can be reviewed before external distribution.';
        Tests='Use sample workflows to identify sensitive fields and ensure outputs can redact or summarize them.';
        Considerations='Codex local workflows and hosted App workflows may have different trust assumptions.'
    },

    @{
        Id='seal-epic-release-distribution'; Title='Epic: Release, documentation, and public distribution'; Type='epic'; Priority='P1'; Parent=''; Labels='epic,release,docs,distribution';
        Background='The plugin needs enough packaging, documentation, examples, and release discipline for users to install it and trust it.';
        Approach='Create release docs, installation instructions, examples, changelog, packaging checks, and public-facing workflow demos once the core path works.';
        Success='A new user can install SEAL, run the first workflow, inspect generated artifacts, and understand limitations.';
        Tests='Run a clean install and first workflow from the published docs.';
        Considerations='Documentation should be practical and workflow-first, not a systems-engineering textbook.'
    },
    @{
        Id='seal-docs-first-run'; Title='Write guided first-run for non-expert Codex users'; Type='task'; Priority='P0'; Parent='seal-epic-release-distribution'; Labels='docs,onboarding,non-expert,p0-lite';
        Background='The first-run guide is the key usability artifact for users who are not systems engineers.';
        Approach='Write a short guide that explains what SEAL is, what command or skill prompt to run, what files it creates, what questions it may ask, what done looks like, and what to do when it finds unknowns. Include the prompt: Use SEAL to map this repo and tell me what is unknown.';
        Success='A user can complete the first workflow without knowing SEAL internals or systems-engineering terminology.';
        Tests='Have the guide executed from a clean clone and update any missing steps.';
        Considerations='Keep troubleshooting practical and tied to likely installation or validation errors.'
    },
    @{
        Id='seal-docs-example-workflows'; Title='Create example workflows for plan, gstack, and existing project inputs'; Type='task'; Priority='P1'; Parent='seal-epic-release-distribution'; Labels='docs,examples,gstack';
        Background='Examples will show how SEAL complements gstack and helps maintain real projects.';
        Approach='Create three small examples: one plain Markdown plan, one gstack-style plan, and one existing project. Show inputs, commands, outputs, and next actions.';
        Success='Examples demonstrate the main value propositions without requiring a large sample repo.';
        Tests='Run each example through the current plugin workflow and validator.';
        Considerations='Examples should expose imperfect plans and show how SEAL handles gaps.'
    },
    @{
        Id='seal-release-checklist'; Title='Create release checklist and versioning process'; Type='task'; Priority='P1'; Parent='seal-epic-release-distribution'; Labels='release,process,versioning';
        Background='Public plugin distribution needs repeatable release discipline.';
        Approach='Define version bump rules, changelog expectations, packaging checks, validation commands, docs checks, and release notes.';
        Success='A maintainer can cut a release by following one checklist.';
        Tests='Dry-run the release checklist before the first public release.';
        Considerations='Keep the checklist realistic for a small project.'
    },
    @{
        Id='seal-marketplace-assets'; Title='Prepare marketplace and launch assets'; Type='task'; Priority='P2'; Parent='seal-epic-release-distribution'; Labels='marketplace,launch,copy';
        Background='If advertised as a Codex plugin, SEAL needs clear marketplace-style assets and launch copy.';
        Approach='Prepare concise description, screenshots or terminal captures, supported inputs, limitations, support link, and example outputs.';
        Success='The launch package explains SEAL in practical terms and routes users to the first-run guide.';
        Tests='Review assets against actual plugin behavior after smoke tests pass.';
        Considerations='Do not create launch assets that imply ChatGPT App availability before that adapter exists.'
    }
)

foreach ($bead in $beads) {
    Add-SealBead `
        -ExistingIds $existingIds `
        -Id $bead.Id `
        -Title $bead.Title `
        -Type $bead.Type `
        -Priority $bead.Priority `
        -Parent $bead.Parent `
        -Labels $bead.Labels `
        -Background $bead.Background `
        -Approach $bead.Approach `
        -Success $bead.Success `
        -Tests $bead.Tests `
        -Considerations $bead.Considerations
}

foreach ($bead in $beads) {
    Set-SealParent -Id $bead.Id -Parent $bead.Parent
}

$removedDependencies = @(
    @{ Blocked='seal-product-positioning'; Blocker='seal-user-personas' },
    @{ Blocked='seal-product-glossary'; Blocker='seal-user-personas' },
    @{ Blocked='seal-plugin-skill-routing'; Blocker='seal-user-personas' },
    @{ Blocked='seal-plugin-skill-routing'; Blocker='seal-product-glossary' }
)

foreach ($dependency in $removedDependencies) {
    Remove-SealDependency -Blocked $dependency.Blocked -Blocker $dependency.Blocker
}

$dependencies = @(
    @{ Blocked='seal-product-gstack-bridge'; Blocker='seal-user-personas' },

    @{ Blocked='seal-plugin-manifest'; Blocker='seal-plugin-repo-scaffold' },
    @{ Blocked='seal-plugin-invocation'; Blocker='seal-plugin-manifest' },
    @{ Blocked='seal-plugin-smoke'; Blocker='seal-plugin-invocation' },
    @{ Blocked='seal-plugin-smoke'; Blocker='seal-plugin-skill-routing' },
    @{ Blocked='seal-plugin-smoke'; Blocker='seal-fixtures-pass-fail' },
    @{ Blocked='seal-plugin-smoke'; Blocker='seal-launch-readiness-report' },
    @{ Blocked='seal-plugin-smoke'; Blocker='seal-context-pack-builder' },

    @{ Blocked='seal-artifact-id-ref-model'; Blocker='seal-artifact-schema-pass' },
    @{ Blocked='seal-authority-source-registry'; Blocker='seal-artifact-id-ref-model' },
    @{ Blocked='seal-authority-source-registry'; Blocker='seal-artifact-schema-pass' },
    @{ Blocked='seal-artifact-templates'; Blocker='seal-artifact-schema-pass' },
    @{ Blocked='seal-artifact-templates'; Blocker='seal-artifact-id-ref-model' },
    @{ Blocked='seal-artifact-templates'; Blocker='seal-authority-source-registry' },
    @{ Blocked='seal-artifact-migrations'; Blocker='seal-artifact-schema-pass' },

    @{ Blocked='seal-ingest-markdown-plan'; Blocker='seal-artifact-templates' },
    @{ Blocked='seal-ingest-gstack-output'; Blocker='seal-product-gstack-bridge' },
    @{ Blocked='seal-ingest-gstack-output'; Blocker='seal-ingest-markdown-plan' },
    @{ Blocked='seal-ingest-existing-project'; Blocker='seal-artifact-templates' },
    @{ Blocked='seal-ingest-existing-project'; Blocker='seal-map-inventory-engine' },
    @{ Blocked='seal-ingest-gap-review'; Blocker='seal-ingest-markdown-plan' },
    @{ Blocked='seal-ingest-gap-review'; Blocker='seal-ingest-existing-project' },
    @{ Blocked='seal-ingest-gap-review'; Blocker='seal-unmapped-debt-register' },
    @{ Blocked='seal-ingest-gap-review'; Blocker='seal-proof-gap-report' },

    @{ Blocked='seal-map-component-classifier'; Blocker='seal-map-inventory-engine' },
    @{ Blocked='seal-map-component-classifier'; Blocker='seal-authority-source-registry' },
    @{ Blocked='seal-unmapped-debt-register'; Blocker='seal-map-inventory-engine' },
    @{ Blocked='seal-unmapped-debt-register'; Blocker='seal-map-component-classifier' },
    @{ Blocked='seal-map-rendered-views'; Blocker='seal-map-component-classifier' },
    @{ Blocked='seal-map-rendered-views'; Blocker='seal-unmapped-debt-register' },
    @{ Blocked='seal-impact-change-scope'; Blocker='seal-artifact-id-ref-model' },
    @{ Blocked='seal-impact-change-scope'; Blocker='seal-map-component-classifier' },
    @{ Blocked='seal-impact-change-scope'; Blocker='seal-validate-file-coverage' },
    @{ Blocked='seal-impact-proof-obligations'; Blocker='seal-impact-change-scope' },
    @{ Blocked='seal-impact-proof-obligations'; Blocker='seal-proof-claim-taxonomy' },
    @{ Blocked='seal-impact-proof-obligations'; Blocker='seal-proof-evidence-store' },
    @{ Blocked='seal-context-pack-builder'; Blocker='seal-map-rendered-views' },
    @{ Blocked='seal-context-pack-builder'; Blocker='seal-impact-change-scope' },
    @{ Blocked='seal-context-pack-builder'; Blocker='seal-proof-gap-report' },

    @{ Blocked='seal-proof-evidence-store'; Blocker='seal-proof-claim-taxonomy' },
    @{ Blocked='seal-proof-evidence-store'; Blocker='seal-authority-source-registry' },
    @{ Blocked='seal-proof-gap-report'; Blocker='seal-proof-evidence-store' },
    @{ Blocked='seal-gate-entry-exit-criteria'; Blocker='seal-proof-evidence-store' },
    @{ Blocked='seal-gate-entry-exit-criteria'; Blocker='seal-validate-file-coverage' },
    @{ Blocked='seal-gates-policy-engine'; Blocker='seal-proof-evidence-store' },
    @{ Blocked='seal-gates-policy-engine'; Blocker='seal-gate-entry-exit-criteria' },
    @{ Blocked='seal-launch-readiness-report'; Blocker='seal-gates-policy-engine' },
    @{ Blocked='seal-launch-readiness-report'; Blocker='seal-ingest-gap-review' },
    @{ Blocked='seal-launch-readiness-report'; Blocker='seal-proof-gap-report' },
    @{ Blocked='seal-launch-readiness-report'; Blocker='seal-impact-proof-obligations' },
    @{ Blocked='seal-launch-readiness-report'; Blocker='seal-map-rendered-views' },
    @{ Blocked='seal-srl-levels'; Blocker='seal-gates-policy-engine' },

    @{ Blocked='seal-validate-schema'; Blocker='seal-artifact-schema-pass' },
    @{ Blocked='seal-validate-ref-integrity'; Blocker='seal-artifact-id-ref-model' },
    @{ Blocked='seal-validate-ref-integrity'; Blocker='seal-authority-source-registry' },
    @{ Blocked='seal-validate-file-coverage'; Blocker='seal-map-inventory-engine' },
    @{ Blocked='seal-validate-file-coverage'; Blocker='seal-unmapped-debt-register' },
    @{ Blocked='seal-fixtures-pass-fail'; Blocker='seal-validate-schema' },
    @{ Blocked='seal-fixtures-pass-fail'; Blocker='seal-validate-ref-integrity' },
    @{ Blocked='seal-fixtures-pass-fail'; Blocker='seal-validate-file-coverage' },
    @{ Blocked='seal-ci-smoke-suite'; Blocker='seal-fixtures-pass-fail' },

    @{ Blocked='seal-mcp-tool-design'; Blocker='seal-plugin-smoke' },
    @{ Blocked='seal-mcp-tool-design'; Blocker='seal-launch-readiness-report' },
    @{ Blocked='seal-app-output-schemas'; Blocker='seal-mcp-tool-design' },
    @{ Blocked='seal-app-submission-readiness'; Blocker='seal-app-output-schemas' },
    @{ Blocked='seal-adapter-security-privacy'; Blocker='seal-mcp-tool-design' },

    @{ Blocked='seal-docs-first-run'; Blocker='seal-product-glossary' },
    @{ Blocked='seal-docs-first-run'; Blocker='seal-plugin-invocation' },
    @{ Blocked='seal-docs-first-run'; Blocker='seal-launch-readiness-report' },
    @{ Blocked='seal-docs-example-workflows'; Blocker='seal-fixtures-pass-fail' },
    @{ Blocked='seal-docs-example-workflows'; Blocker='seal-launch-readiness-report' },
    @{ Blocked='seal-release-checklist'; Blocker='seal-ci-smoke-suite' },
    @{ Blocked='seal-marketplace-assets'; Blocker='seal-product-positioning' },
    @{ Blocked='seal-marketplace-assets'; Blocker='seal-docs-example-workflows' }
)

foreach ($dependency in $dependencies) {
    Add-SealDependency -Blocked $dependency.Blocked -Blocker $dependency.Blocker
}

& bd sync
if ($LASTEXITCODE -ne 0) {
    throw 'bd sync failed after seed.'
}

Write-Host 'SEAL bead seed complete.'
