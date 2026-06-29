import assert from "node:assert/strict";
import { greet } from "./index.js";

assert.equal(greet("seal"), "hello seal");
