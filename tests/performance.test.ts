import test from "node:test";
import assert from "node:assert/strict";
import { makeBatches } from "../src/builder/scheduler.js";

for (const blocks of [1_000, 5_000, 10_000, 25_000]) {
  test(`schedules ${blocks} blocks within the mobile budget`, () => {
    const started = performance.now();
    const batches = makeBatches([{ kind: "box", from: [0,0,0], to: [blocks - 1,0,0], block: "minecraft:stone" }], 384);
    assert.ok(batches.every(batch => batch.volume <= 384));
    assert.equal(batches.reduce((sum, batch) => sum + batch.volume, 0), blocks);
    assert.ok(performance.now() - started < 100);
  });
}
