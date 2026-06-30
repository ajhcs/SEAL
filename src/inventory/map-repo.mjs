import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateArtifact } from "../artifacts/schema-registry.mjs";
import { validateArtifactReferences } from "../artifacts/reference-integrity.mjs";
import { stringifyArtifact } from "../artifacts/generate.mjs";
import { CONTRACT_SCHEMA_VERSION } from "../contracts/constants.mjs";
import { classifyFile } from "./classify.mjs";
import { listInventoryFiles } from "./walk.mjs";

const entrypointNames = new Set(["app", "cli", "index", "main", "server"]);
const codeExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py"]);

function idSegment(value) {
  const normalized = value.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized.toLowerCase() : "root";
}

function componentIdForModule(baseId, moduleName) {
  return `${baseId}.${idSegment(moduleName)}`;
}

function gapIdForFile(prefix, filePath) {
  return `${prefix}.${idSegment(filePath)}`;
}

function recordId(prefix, value) {
  return `${prefix}.${idSegment(String(value))}`;
}

function sourceAuthority(sourceId) {
  return {
    source_refs: [sourceId],
    authority_state: "repo_observed",
    approval_state: "not_required",
    confidence: 0.8
  };
}

function inferredAuthority(sourceId) {
  return {
    source_refs: [sourceId],
    authority_state: "inferred",
    approval_state: "pending",
    confidence: 0.65
  };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function moduleForPath(filePath) {
  const parts = filePath.split("/");
  return parts.length > 1 ? parts[0] : "root";
}

function roleForFile(filePath, classification) {
  if (classification === "test") {
    return "validation";
  }
  if (classification === "documentation") {
    return "documentation";
  }
  if (classification === "config" || classification === "build" || classification === "script") {
    return "project_setup";
  }
  if (classification === "unknown") {
    return "unknown";
  }

  const parsed = path.posix.parse(filePath);
  if (classification === "product_code" && entrypointNames.has(parsed.name.toLowerCase())) {
    return "entrypoint";
  }

  return classification;
}

function summarizeModules(fileRecords) {
  const modules = new Map();
  for (const file of fileRecords) {
    const moduleName = moduleForPath(file.path);
    const summary = modules.get(moduleName) ?? {
      name: moduleName,
      file_count: 0,
      classifications: {}
    };
    summary.file_count += 1;
    summary.classifications[file.classification] = (summary.classifications[file.classification] ?? 0) + 1;
    modules.set(moduleName, summary);
  }

  return [...modules.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function hasCodeExtension(filePath) {
  return codeExtensions.has(path.posix.extname(filePath).toLowerCase());
}

function resolveRelativeImport(fromPath, specifier, observedPaths) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const fromDir = path.posix.dirname(fromPath);
  const base = path.posix.normalize(path.posix.join(fromDir, specifier));
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.jsx`,
    path.posix.join(base, "index.js"),
    path.posix.join(base, "index.ts")
  ];

  return candidates.find((candidate) => observedPaths.has(candidate)) ?? null;
}

function extractCodeFacts(filePath, content, observedPaths) {
  const dependencies = [];
  const interfaces = [];
  const importPattern = /\bimport\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']|require\(["']([^"']+)["']\)/g;
  const routePattern = /\b(?:app|router)\.(get|post|put|patch|delete)\(["']([^"']+)["']/gi;

  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    const targetPath = resolveRelativeImport(filePath, specifier, observedPaths);
    dependencies.push(targetPath
      ? { kind: "file", specifier, path: targetPath, source: "static_import" }
      : { kind: specifier.startsWith(".") ? "unresolved_file" : "external_package", specifier, source: "static_import" });
  }

  if (/\bexport\s+/.test(content) || /\bmodule\.exports\b/.test(content)) {
    interfaces.push({ kind: "export", name: "module_exports", source: "static_inspection" });
  }

  for (const match of content.matchAll(routePattern)) {
    interfaces.push({
      kind: "http_route",
      method: match[1].toUpperCase(),
      path: match[2],
      source: "static_inspection"
    });
  }

  return { dependencies, interfaces };
}

async function readCodeFacts(rootDir, files) {
  const observedPaths = new Set(files);
  const facts = new Map();

  await Promise.all(files.filter(hasCodeExtension).map(async (filePath) => {
    const absolutePath = path.join(rootDir, filePath);
    try {
      const content = await readFile(absolutePath, "utf8");
      facts.set(filePath, extractCodeFacts(filePath, content, observedPaths));
    } catch {
      facts.set(filePath, { dependencies: [], interfaces: [] });
    }
  }));

  return facts;
}

async function readFileHashes(rootDir, files) {
  const hashes = new Map();
  await Promise.all(files.map(async (filePath) => {
    const absolutePath = path.join(rootDir, filePath);
    try {
      hashes.set(filePath, sha256(await readFile(absolutePath)));
    } catch {
      hashes.set(filePath, "0".repeat(64));
    }
  }));
  return hashes;
}

function relatedTestsForFile(filePath, fileRecords, factsByPath) {
  const directNames = [
    filePath.replace(/\.[^.]+$/, ".test$&"),
    filePath.replace(/\.[^.]+$/, ".spec$&")
  ];
  const sameBase = path.posix.basename(filePath).replace(/\.[^.]+$/, "");

  return fileRecords.filter((candidate) => {
    if (candidate.classification !== "test") {
      return false;
    }
    if (directNames.includes(candidate.path)) {
      return true;
    }
    const importedPaths = (factsByPath.get(candidate.path)?.dependencies ?? [])
      .filter((dependency) => dependency.kind === "file")
      .map((dependency) => dependency.path);
    if (importedPaths.includes(filePath)) {
      return true;
    }
    return path.posix.basename(candidate.path).includes(sameBase);
  }).map((test) => test.path);
}

function interfacesForFile(filePath, role, classification, facts) {
  const interfaces = [...(facts?.interfaces ?? [])];

  if (role === "entrypoint") {
    interfaces.push({ kind: "entrypoint", name: filePath, source: "path_evidence" });
  }
  if (classification === "config" && path.posix.basename(filePath) === "package.json") {
    interfaces.push({ kind: "package_metadata", name: "package.json", source: "path_evidence" });
  }
  if (classification === "migration") {
    interfaces.push({ kind: "data_store_change", name: filePath, source: "path_evidence" });
  }

  return interfaces;
}

function purposeForFile(filePath, classification, role) {
  if (role === "entrypoint") {
    return `Observed entrypoint candidate for ${filePath}.`;
  }
  if (classification === "test") {
    return `Observed validation or test coverage file for ${filePath}.`;
  }
  if (classification === "migration") {
    return `Observed data migration file for ${filePath}.`;
  }
  if (classification === "unknown") {
    return `Observed file with unknown purpose: ${filePath}.`;
  }
  return `Observed ${classification.replaceAll("_", " ")} file for ${filePath}.`;
}

function componentPurpose(moduleName, files) {
  const classes = new Set(files.map((file) => file.classification));
  if (classes.has("product_code")) {
    return `Observed implementation component inferred from files under ${moduleName}.`;
  }
  if (classes.has("test")) {
    return `Observed validation component inferred from files under ${moduleName}.`;
  }
  if (classes.has("documentation")) {
    return `Observed documentation component inferred from files under ${moduleName}.`;
  }
  return `Observed repository area inferred from files under ${moduleName}.`;
}

function createDependencyRecords(fileRecords, sourceId) {
  const records = new Map();
  for (const file of fileRecords) {
    for (const dependency of file.dependencies) {
      const key = dependency.path ?? dependency.specifier;
      if (!key) {
        continue;
      }
      const id = recordId("dep", `${file.path}-${key}`);
      if (!records.has(id)) {
        records.set(id, {
          id,
          name: key,
          summary: dependency.path
            ? `${file.path} imports ${dependency.path}.`
            : `${file.path} imports external package ${dependency.specifier}.`,
          kind: dependency.kind,
          specifier: dependency.specifier,
          path: dependency.path,
          owner_component_id: file.owner_component_id,
          file: file.path,
          source: dependency.source,
          ...sourceAuthority(sourceId)
        });
      }
      file.dependency_refs.push(id);
    }
  }
  return [...records.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function createInterfaceRecords(fileRecords, sourceId) {
  const records = new Map();
  for (const file of fileRecords) {
    for (const item of file.interfaces_touched) {
      const label = item.path ?? item.name ?? item.method ?? item.kind ?? file.path;
      const id = recordId("if", `${file.path}-${item.kind}-${label}`);
      if (!records.has(id)) {
        records.set(id, {
          id,
          name: label,
          summary: `${file.path} exposes or touches ${item.kind}.`,
          kind: item.kind,
          file: file.path,
          owner_component_id: file.owner_component_id,
          ...item,
          ...sourceAuthority(sourceId)
        });
      }
      file.interface_refs.push(id);
    }
  }
  return [...records.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function createDataStoreRecords(fileRecords, sourceId) {
  return fileRecords
    .filter((file) => file.classification === "migration")
    .map((file) => ({
      id: recordId("data", file.path),
      name: file.path,
      summary: `Observed migration or data-store change at ${file.path}.`,
      owner_component_id: file.owner_component_id,
      schema_or_migration_ref: file.path,
      invariants: [],
      proof_gaps: file.gap_refs,
      ...sourceAuthority(sourceId)
    }));
}

function createTestRecords(fileRecords, sourceId) {
  return fileRecords
    .filter((file) => file.classification === "test")
    .map((file) => ({
      id: recordId("test", file.path),
      name: file.path,
      summary: `Observed test file ${file.path}.`,
      path: file.path,
      owner_component_id: file.owner_component_id,
      proves: [],
      ...sourceAuthority(sourceId)
    }));
}

function serviceProviderForDependency(specifier) {
  const normalized = String(specifier ?? "").toLowerCase();
  const providers = [
    ["@aws-sdk", "aws"],
    ["aws-sdk", "aws"],
    ["@google-cloud", "google-cloud"],
    ["openai", "openai"],
    ["stripe", "stripe"],
    ["paypal", "paypal"],
    ["twilio", "twilio"],
    ["sendgrid", "sendgrid"],
    ["mailgun", "mailgun"],
    ["resend", "resend"],
    ["supabase", "supabase"],
    ["firebase", "firebase"],
    ["@neondatabase", "neon"],
    ["planetscale", "planetscale"],
    ["mongodb", "mongodb"],
    ["mongoose", "mongodb"],
    ["pg", "postgres"],
    ["mysql", "mysql"],
    ["redis", "redis"],
    ["ioredis", "redis"],
    ["algolia", "algolia"],
    ["meilisearch", "meilisearch"],
    ["elasticsearch", "elasticsearch"],
    ["@elastic", "elasticsearch"],
    ["cloudflare", "cloudflare"]
  ];
  return providers.find(([needle]) => normalized === needle || normalized.startsWith(`${needle}/`))?.[1] ?? null;
}

function serviceKindForProvider(provider) {
  if (["stripe", "paypal"].includes(provider)) {
    return "payment";
  }
  if (["sendgrid", "mailgun", "resend", "twilio"].includes(provider)) {
    return "messaging";
  }
  if (["postgres", "mysql", "mongodb", "redis", "neon", "planetscale", "supabase", "firebase"].includes(provider)) {
    return "data_store";
  }
  if (["algolia", "meilisearch", "elasticsearch"].includes(provider)) {
    return "search";
  }
  if (["openai"].includes(provider)) {
    return "ai";
  }
  if (["aws", "google-cloud", "cloudflare"].includes(provider)) {
    return "cloud";
  }
  return "external_service";
}

function createServiceDiscovery({ fileRecords, sourceId }) {
  const services = new Map();
  const negativeEvidence = [
    "checked package.json dependencies",
    "checked env var names",
    "checked wrangler/cloudflare config",
    "checked Docker/compose files",
    "checked CI configs",
    "checked known SDK imports"
  ];

  for (const file of fileRecords) {
    for (const dependency of file.dependencies) {
      const provider = serviceProviderForDependency(dependency.specifier);
      if (!provider) {
        continue;
      }
      const id = recordId("svc", provider);
      const gapId = recordId("gap.service-cost", provider);
      const current = services.get(id) ?? {
        id,
        name: provider,
        kind: serviceKindForProvider(provider),
        owner_component: file.owner_component_id,
        interfaces: [],
        cost_model: "unknown",
        data_risk: "unknown",
        runtime_dependency: true,
        approval_required_for_changes: true,
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "pending",
        confidence: 0.7,
        observed_in: [],
        unknowns: [gapId]
      };
      current.observed_in.push(file.path);
      services.set(id, current);
    }
  }

  const serviceCostGaps = [...services.values()].map((service) => ({
    id: service.unknowns[0],
    summary: `Cost and data risk model is unknown for service ${service.name}.`,
    missing: `Cost model, data risk, and approval rules for ${service.name}.`,
    closure_method: "Document service owner, cost model, data risk, and approval policy.",
    blocks: ["SRL-4", "fly"],
    severity: "warning",
    status: "open",
    plain_language: `SEAL found ${service.name}, but not enough authority to prove its cost or data-risk model.`,
    next_step: "Record cost, data sensitivity, runtime dependency, and approval owner.",
    ...sourceAuthority(sourceId)
  }));

  return {
    discovered: [...services.values()].sort((a, b) => a.id.localeCompare(b.id)),
    negative_evidence: negativeEvidence,
    gaps: services.size === 0 ? ["gap.service-cost-discovery"] : serviceCostGaps.map((gap) => gap.id),
    serviceCostGaps
  };
}

function createComponents({ componentId, fileRecords, sourceId }) {
  const byModule = new Map();
  for (const file of fileRecords) {
    const moduleFiles = byModule.get(file.module) ?? [];
    moduleFiles.push(file);
    byModule.set(file.module, moduleFiles);
  }

  return [...byModule.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([moduleName, moduleFiles]) => {
      const dependencies = new Map();
      for (const file of moduleFiles) {
        for (const dependency of file.dependencies) {
          const key = dependency.path ?? dependency.specifier;
          dependencies.set(key, dependency);
        }
      }

      return {
        id: componentIdForModule(componentId, moduleName),
        name: moduleName === "root" ? "Repository root" : `${moduleName} module`,
        ...inferredAuthority(sourceId),
        purpose: componentPurpose(moduleName, moduleFiles),
        inference_basis: "Top-level path grouping plus static file evidence; human review may split or merge this component.",
        files: moduleFiles.map((file) => file.path),
        dependencies: [...new Set(moduleFiles.flatMap((file) => file.dependency_refs))],
        interfaces: [...new Set(moduleFiles.flatMap((file) => file.interface_refs))],
        tests: moduleFiles.filter((file) => file.classification === "test").map((file) => file.path),
        proof_gaps: [...new Set(moduleFiles.flatMap((file) => file.gap_refs ?? []))],
        unknowns: [...new Set(moduleFiles.flatMap((file) => file.gap_refs ?? []))],
        source_files: moduleFiles.map((file) => file.path),
        entrypoints: moduleFiles.filter((file) => file.entrypoint).map((file) => file.path),
        data_stores: moduleFiles
          .filter((file) => file.classification === "migration")
          .map((file) => ({ path: file.path, kind: "migration", source: "path_evidence" })),
        interface_details: moduleFiles.flatMap((file) => file.interfaces_touched.map((item) => ({ ...item, file: file.path }))),
        dependency_details: [...dependencies.values()],
        gaps: moduleFiles.flatMap((file) => file.gap_refs ?? []),
        next_step: "Review this inferred component boundary, dependencies, interfaces, and proof links."
      };
    });
}

function createValidationPlan({ hasProductCode, hasTests, unknownFiles, sourceId }) {
  const plan = [
    {
      id: "validate.repo-map-schema",
      action: "Run seal-validate after ingestion artifacts are written.",
      proves: "Generated artifacts are schema-valid and source-authority-aware.",
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.8
    },
    {
      id: "validate.repo-file-coverage",
      action: "Review that every non-ignored file is represented in .seal/map.yaml.",
      proves: "No observed repository file is hidden from the map.",
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.8
    }
  ];

  if (unknownFiles.length > 0) {
    plan.push({
      id: "validate.repo-unknown-review",
      action: "Classify unknown files or keep their gaps open.",
      proves: "Unknowns stay visible instead of becoming silent assumptions.",
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.8
    });
  }

  if (hasProductCode) {
    plan.push({
      id: "validate.repo-proof-links",
      action: hasTests
        ? "Link product code files to their relevant tests or record missing proof gaps."
        : "Add tests or record explicit proof gaps for product code.",
      proves: "Implementation claims are backed by evidence or visible gaps.",
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.7
    });
  }

  return plan;
}

function createRepoGaps({ unknownFiles, hasProductCode, hasTests, sourceId }) {
  const gaps = unknownFiles.map((file) => ({
    id: gapIdForFile("gap.unknown-file", file.path),
    summary: `File classification is unknown for ${file.path}.`,
    reason: "The inventory engine could not classify this file from path and extension evidence.",
    source_refs: [sourceId],
    authority_state: "repo_observed",
    approval_state: "not_required",
    confidence: 0.8,
    status: "open",
    plain_language: "SEAL saw this file but could not classify it confidently.",
    next_step: "Classify the file manually or improve classifier rules."
  }));

  gaps.push({
    id: "gap.repo-component-boundaries",
    summary: "Repository component boundaries still need review.",
    reason: "Initial classification proposes path-based components but still needs stronger architectural authority or human approval.",
    source_refs: [sourceId],
    authority_state: "repo_observed",
    approval_state: "not_required",
    confidence: 0.8,
    status: "open",
    plain_language: "SEAL proposed components from repository evidence, but their boundaries are not approved yet.",
    next_step: "Review, split, merge, or approve inferred components."
  });

  gaps.push({
    id: "gap.repo-business-requirements",
    summary: "Business requirements were not recovered from code alone.",
    reason: "Static repository inspection can observe files, but it cannot prove user goals, constraints, or launch intent without an authoritative plan or approval.",
    source_refs: [sourceId],
    authority_state: "repo_observed",
    approval_state: "not_required",
    confidence: 0.8,
    status: "open",
    plain_language: "Code inspection does not prove what the project is supposed to do for users.",
    next_step: "Attach a plan, product brief, issue, or human approval as source authority."
  });

  if (hasProductCode) {
    gaps.push({
      id: "gap.repo-test-proof-links",
      summary: hasTests
        ? "Product code is not yet linked to specific test evidence."
        : "Product code has no observed test files in the repository inventory.",
      reason: hasTests
        ? "Initial ingestion sees test files, but does not yet prove which product files they cover."
        : "Initial ingestion did not observe files classified as tests.",
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "not_required",
      confidence: 0.8,
      status: "open",
      plain_language: "Implementation proof is incomplete until tests or validation evidence are linked.",
      next_step: "Record test output, validation commands, or explicit proof gaps for each product area."
    });
  }

  return gaps;
}

export async function createRepoMap(rootDir, { sourceId = "src.repo-inventory", componentId = "cmp.repo" } = {}) {
  const files = await listInventoryFiles(rootDir);
  const factsByPath = await readCodeFacts(rootDir, files);
  const hashesByPath = await readFileHashes(rootDir, files);
  const mappedAt = new Date().toISOString();
  const fileRecords = files.map((filePath) => {
    const classification = classifyFile(filePath);
    const role = roleForFile(filePath, classification);
    const module = moduleForPath(filePath);
    const ownerComponentId = componentIdForModule(componentId, module);
    const facts = factsByPath.get(filePath);
    const interfaces = interfacesForFile(filePath, role, classification, facts);
    const gapRefs = classification === "unknown" ? [gapIdForFile("gap.unknown-file", filePath)] : [];

    return {
      path: filePath,
      classification,
      component_id: ownerComponentId,
      owner_component_id: ownerComponentId,
      ownership_status: classification === "unknown" ? "unknown" : "owned",
      content_hash: hashesByPath.get(filePath),
      mapped_at: mappedAt,
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.8,
      module,
      role,
      entrypoint: role === "entrypoint",
      dependencies: facts?.dependencies ?? [],
      dependency_refs: [],
      interfaces_touched: interfaces,
      interface_refs: [],
      tests: [],
      proof_status: classification === "product_code" ? "proof_gap" : "not_required_yet",
      gap_refs: gapRefs,
      purpose: purposeForFile(filePath, classification, role),
      next_step: role === "unknown"
        ? "Classify this file or leave the unknown gap open."
        : "Confirm the owning component, purpose, dependencies, and proof coverage."
    };
  });

  const dependencies = createDependencyRecords(fileRecords, sourceId);
  const interfaces = createInterfaceRecords(fileRecords, sourceId);

  for (const file of fileRecords) {
    if (file.classification !== "product_code") {
      continue;
    }

    file.tests = relatedTestsForFile(file.path, fileRecords, factsByPath);
    if (file.tests.length > 0) {
      file.proof_status = "test_link_observed";
      file.next_step = "Run the linked tests and attach command output as evidence.";
    } else {
      const gapId = gapIdForFile("gap.file-proof", file.path);
      file.gap_refs.push(gapId);
      file.next_step = "Link this product file to tests or record why proof is not required.";
    }
  }

  const unknownFiles = fileRecords.filter((file) => file.classification === "unknown");
  const hasProductCode = fileRecords.some((file) => file.classification === "product_code");
  const hasTests = fileRecords.some((file) => file.classification === "test");
  const entrypoints = fileRecords.filter((file) => file.entrypoint).map((file) => file.path);
  const modules = summarizeModules(fileRecords);
  const validationPlan = createValidationPlan({ hasProductCode, hasTests, unknownFiles, sourceId });
  const dataStores = createDataStoreRecords(fileRecords, sourceId);
  const tests = createTestRecords(fileRecords, sourceId);
  const serviceDiscovery = createServiceDiscovery({ fileRecords, sourceId });
  const components = createComponents({ componentId, fileRecords, sourceId });
  const productProofGaps = fileRecords.flatMap((file) => file.classification === "product_code" ? file.gap_refs : []);
  const repoGaps = [
    ...createRepoGaps({ unknownFiles, hasProductCode, hasTests, sourceId }),
    ...fileRecords
      .filter((file) => file.classification === "product_code" && file.tests.length === 0)
      .map((file) => ({
        id: gapIdForFile("gap.file-proof", file.path),
        summary: `No direct test or proof evidence is linked for ${file.path}.`,
        missing: `Proof evidence for ${file.path}.`,
        closure_method: "Link a test, validation command, evidence record, or approved exception.",
        blocks: ["SRL-4"],
        severity: "warning",
        reason: "Static repository inspection did not find a direct test import or matching test file for this product code file.",
        source_refs: [sourceId],
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 0.75,
        status: "open",
        plain_language: "SEAL found implementation code but not proof that this specific file works.",
        next_step: "Link a test, validation command, evidence record, or approved exception."
      })),
    ...(serviceDiscovery.discovered.length === 0
      ? [{
          id: "gap.service-cost-discovery",
          summary: "No external services or cost-bearing dependencies were proven.",
          missing: "Authoritative confirmation of service and cost-bearing surfaces.",
          closure_method: "Review dependency, env, config, CI, and SDK scan evidence or document known services.",
          blocks: ["SRL-4"],
          severity: "warning",
          source_refs: [sourceId],
          authority_state: "repo_observed",
          approval_state: "not_required",
          confidence: 0.75,
          status: "open",
          plain_language: "SEAL checked common service surfaces but cannot prove there are no services without review.",
          negative_evidence: serviceDiscovery.negative_evidence,
          next_step: "Approve the negative evidence or add service records."
        }]
      : serviceDiscovery.serviceCostGaps)
  ];

  const drift = components.map((component) => ({
    id: recordId("drift", component.id),
    observed_component: component.id,
    approved_component: null,
    issue: "Observed component exists in repo but is not yet approved by PLAN or human architecture authority.",
    severity: "warning",
    ...inferredAuthority(sourceId)
  }));
  const rootComponent = {
    id: componentId,
    name: "Repository",
    source_refs: [sourceId],
    authority_state: "repo_observed",
    approval_state: "pending",
    confidence: 0.8,
    purpose: "Repository-level summary for observed component classification.",
    files: fileRecords.map((file) => file.path),
    dependencies: dependencies.map((dependency) => dependency.id),
    interfaces: interfaces.map((item) => item.id),
    tests: tests.map((test) => test.path),
    proof_gaps: hasProductCode ? ["gap.repo-test-proof-links", ...productProofGaps] : [],
    unknowns: repoGaps.map((gap) => gap.id),
    next_step: "Review inferred component boundaries and close gaps with stronger authority.",
    entrypoints,
    modules,
    validation_plan: validationPlan
  };

  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    purpose: {
      summary: "Observed repository map generated from direct file inventory and lightweight static inspection.",
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.8
    },
    boundary: {
      root: path.resolve(rootDir),
      included: ["repository files returned by inventory walker"],
      excluded: [".git", ".seal", "node_modules", ".gitignore patterns"],
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "not_required",
      confidence: 0.8
    },
    observed: {
      components: [componentId, ...components.map((component) => component.id)],
      files: fileRecords.map((file) => file.path),
      dependencies: dependencies.map((dependency) => dependency.id),
      services: serviceDiscovery.discovered.map((service) => service.id),
      interfaces: interfaces.map((item) => item.id),
      data_stores: dataStores.map((store) => store.id),
      tests: tests.map((test) => test.id),
      source_refs: [sourceId],
      authority_state: "repo_observed",
      approval_state: "pending",
      confidence: 0.8
    },
    approved: {
      components: [],
      boundaries: [],
      interfaces: [],
      source_refs: [sourceId],
      status: "none",
      authority_state: "unknown",
      approval_state: "pending",
      confidence: 0.1
    },
    drift,
    sources: [
      {
        id: sourceId,
        kind: "repo_observation",
        description: "Repository inventory from direct SEAL file walk and lightweight static inspection.",
        authority_state: "repo_observed",
        approval_state: "not_required",
        confidence: 1,
        label: "Repository inventory",
        plain_language: "SEAL inspected the repository file tree directly.",
        observed_file_count: fileRecords.length,
        ignored_scopes: [".git", ".seal", "node_modules", ".gitignore patterns"]
      }
    ],
    components: [rootComponent, ...components],
    files: fileRecords,
    dependencies,
    services: {
      discovered: serviceDiscovery.discovered,
      negative_evidence: serviceDiscovery.negative_evidence,
      gaps: serviceDiscovery.gaps
    },
    interfaces,
    data_stores: dataStores,
    tests,
    unknowns: repoGaps,
    gaps: repoGaps
  };
}

export async function validateRepoMap(map) {
  const schemaResult = await validateArtifact("map", map);
  if (!schemaResult.valid) {
    return schemaResult;
  }

  return validateArtifactReferences({ map });
}

export async function writeRepoMap(rootDir, options = {}) {
  const map = await createRepoMap(rootDir, options);
  const result = await validateRepoMap(map);
  if (!result.valid) {
    throw new Error(`Generated repo map failed validation: ${JSON.stringify(result.errors)}`);
  }

  const outputPath = path.join(rootDir, ".seal", "map.yaml");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stringifyArtifact(map), "utf8");

  return { map, outputPath };
}
