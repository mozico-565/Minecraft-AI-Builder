import test from "node:test";
import assert from "node:assert/strict";
import { makeBatches, batchTotal } from "../src/builder/scheduler.js";

test("box batches never exceed tick budget", () => {
  const batches = makeBatches([{ kind: "box", from: [0,0,0], to: [24,19,19], block: "minecraft:stone" }], 384);
  assert.ok(batches.length > 1);
  assert.ok(batches.every(batch => batch.volume <= 384));
  assert.equal(batchTotal(batches), 10_000);
});
