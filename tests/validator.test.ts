import test from "node:test";
import assert from "node:assert/strict";
import { validateBlueprint } from "../src/blueprint/validator.js";
import { SAMPLE_BLUEPRINTS } from "../src/examples/samples.js";

test("sample blueprints validate", () => {
  for (const sample of SAMPLE_BLUEPRINTS) {
    const result = validateBlueprint(sample);
    assert.equal(result.ok, true, `${sample.name}: ${result.errors.join(", ")}`);
    assert.ok(result.estimatedBlocks > 0);
  }
});

test("rejects unknown blocks and unsafe estimates", () => {
  const invalid = { version: 1, name: "bad", size: { x: 128, y: 128, z: 128 }, operations: [{ type: "fill", from: [0,0,0], to: [127,127,127], block: "minecraft:not_real" }] };
  const result = validateBlueprint(invalid);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /unknown block|exceeds mobile limit/i);
});

test("rejects arbitrary commands", () => {
  const invalid = { version: 1, name: "command", size: { x: 1, y: 1, z: 1 }, operations: [{ type: "command", value: "/fill ~ ~ ~" }] };
  assert.equal(validateBlueprint(invalid).ok, false);
});
