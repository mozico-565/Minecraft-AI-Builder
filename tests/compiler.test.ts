import test from "node:test";
import assert from "node:assert/strict";
import { compileBlueprint, primitiveVolume } from "../src/blueprint/compiler.js";
import type { Blueprint } from "../src/blueprint/types.js";

test("repeat and mirror expand compactly", () => {
  const blueprint: Blueprint = {
    version: 1, name: "symmetry", size: { x: 10, y: 4, z: 10 },
    operations: [{ type: "mirror", axis: "x", pivot: 4.5, operation: { type: "repeat", count: 3, step: [0, 1, 0], operation: { type: "set_block", at: [1, 0, 1], block: "minecraft:stone" } } }]
  };
  const primitives = compileBlueprint(blueprint);
  assert.equal(primitives.length, 6);
  assert.equal(primitives.reduce((sum, item) => sum + primitiveVolume(item), 0), 6);
});

test("hollow box emits surfaces, not full volume", () => {
  const blueprint: Blueprint = { version: 1, name: "box", size: { x: 10, y: 10, z: 10 }, operations: [{ type: "hollow_box", from: [0,0,0], to: [9,9,9], block: "minecraft:stone" }] };
  const volume = compileBlueprint(blueprint).reduce((sum, item) => sum + primitiveVolume(item), 0);
  assert.ok(volume < 1000);
  assert.ok(volume >= 488);
});
