import test from "node:test";
import assert from "node:assert/strict";
import { rotatePoint, rotatedSize } from "../src/blueprint/transform.js";

test("rotates points inside bounds", () => {
  const size = { x: 20, y: 10, z: 15 };
  assert.deepEqual(rotatePoint([0, 2, 0], size, 90), [14, 2, 0]);
  assert.deepEqual(rotatePoint([19, 2, 14], size, 90), [0, 2, 19]);
  assert.deepEqual(rotatePoint([0, 2, 0], size, 180), [19, 2, 14]);
  assert.deepEqual(rotatedSize(size, 270), { x: 15, y: 10, z: 20 });
});
