import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const smokeTests = [
  ["schema validation", "tests/schema.test.mjs"],
  ["fixture workflow", "tests/full-workflow-fixtures.test.mjs"],
  ["plugin manifest", "tests/plugin-manifest.test.mjs"],
  ["skill routing", "tests/skill-routing.test.mjs"],
  ["launch report generation", "tests/launch-readiness-report.test.mjs"],
  ["plugin artifact smoke", "tests/plugin-smoke.test.mjs"],
  ["artifact validation command surface", "tests/validation.test.mjs"],
];

async function runNodeTest([label, testPath]) {
  console.log(`\n[ci:smoke] ${label}`);

  const child = spawn(process.execPath, [testPath], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${exitCode}`);
  }
}

for (const smokeTest of smokeTests) {
  await runNodeTest(smokeTest);
}

console.log("\n[ci:smoke] SEAL smoke suite passed.");
