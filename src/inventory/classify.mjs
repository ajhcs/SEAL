const documentationExtensions = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);
const productCodeExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".java", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".kts", ".c", ".cc", ".cpp", ".h", ".hpp"]);
const scriptExtensions = new Set([".ps1", ".sh", ".bash", ".zsh", ".cmd", ".bat"]);
const assetExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".mov", ".mp3", ".wav"]);
const configNames = new Set([
  ".env",
  ".env.example",
  ".gitignore",
  ".gitattributes",
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "eslint.config.js",
  "vite.config.js",
  "vitest.config.js",
  "jest.config.js",
  "webpack.config.js",
  "rollup.config.js",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "requirements.txt"
]);
const buildNames = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "Cargo.lock", "Makefile", "Dockerfile"]);

function extensionOf(filePath) {
  const name = filePath.split("/").pop() ?? filePath;
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index).toLowerCase() : "";
}

function hasPathSegment(filePath, segments) {
  const pathSegments = filePath.toLowerCase().split("/");
  return segments.some((segment) => pathSegments.includes(segment));
}

export function classifyFile(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  const lower = normalized.toLowerCase();
  const name = normalized.split("/").pop() ?? normalized;
  const ext = extensionOf(normalized);

  if (hasPathSegment(lower, ["vendor", "vendored", "third_party", "third-party"])) {
    return "vendored";
  }
  if (hasPathSegment(lower, ["generated", "dist", "build", "coverage"]) || lower.endsWith(".min.js")) {
    return "generated";
  }
  if (hasPathSegment(lower, ["migrations", "migration"])) {
    return "migration";
  }
  if (hasPathSegment(lower, ["test", "tests", "__tests__", "spec"]) || /\.(test|spec)\.[^.]+$/i.test(name)) {
    return "test";
  }
  if (hasPathSegment(lower, ["scripts", "script"]) || scriptExtensions.has(ext)) {
    return "script";
  }
  if (configNames.has(name) || /\.(json|ya?ml|toml|ini|cfg|conf)$/i.test(name)) {
    return "config";
  }
  if (buildNames.has(name)) {
    return "build";
  }
  if (documentationExtensions.has(ext) || /^readme(\.|$)/i.test(name)) {
    return "documentation";
  }
  if (assetExtensions.has(ext)) {
    return "asset";
  }
  if (productCodeExtensions.has(ext)) {
    return "product_code";
  }

  return "unknown";
}
