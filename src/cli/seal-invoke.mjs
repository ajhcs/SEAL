#!/usr/bin/env node
import { invokeSeal } from "../invocation/invoke.mjs";

const target = process.argv[2] ?? process.cwd();
const result = await invokeSeal(target);

console.log(`Started SEAL ${result.targetKind} workflow at ${result.outputRoot}`);
for (const [artifactType, filePath] of Object.entries(result.written)) {
  console.log(`${artifactType}: ${filePath}`);
}
