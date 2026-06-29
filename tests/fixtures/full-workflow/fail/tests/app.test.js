import { launchMessage } from "../src/app.js";

if (launchMessage() !== "seal fixture ready") {
  throw new Error("launch message is not ready");
}
