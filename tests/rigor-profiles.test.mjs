import assert from "node:assert/strict";

import {
  DEFAULT_RIGOR_PROFILE,
  detectEscalationRecommendations,
  getRigorProfilePolicy,
  listRigorProfiles,
  profileFromText,
} from "../src/rigor/profiles.mjs";

const profiles = listRigorProfiles();
assert.deepEqual(
  profiles.map((profile) => profile.id),
  ["explore", "standard", "launch", "mission-critical"],
);

for (const profile of profiles) {
  assert.ok(profile.label);
  assert.ok(profile.summary);
  assert.ok(profile.prompt_focus);
  assert.ok(profile.required_artifacts.length > 0);
  assert.ok(profile.evidence);
  assert.ok(profile.approvals);
  assert.ok(profile.launch_gates);
  assert.ok(profile.enforcement);
}

assert.equal(DEFAULT_RIGOR_PROFILE, "standard");
assert.equal(getRigorProfilePolicy().id, "standard");
assert.throws(() => getRigorProfilePolicy("fast"), /Unknown SEAL rigor profile/);

assert.equal(profileFromText("Run this as a safety critical launch review."), "mission-critical");
assert.equal(profileFromText("This touches payment data loss."), undefined);

const recommendations = detectEscalationRecommendations({
  profile: "standard",
  text: "This change can cause payment data loss.",
});
assert.ok(recommendations.some((item) => item.target_profile === "launch"));
assert.ok(!recommendations.some((item) => item.target_profile === "mission-critical"));

console.log("Rigor profile policy tests passed.");
