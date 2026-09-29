import type { BoxPrimitive, Primitive, SetPrimitive } from "../blueprint/compiler.js";
import type { Vec3Tuple } from "../blueprint/types.js";

export interface Batch {
  kind: "box" | "set";
  from: Vec3Tuple;
  to: Vec3Tuple;
  block: string;
  states?: Record<string, string | number | boolean>;
  volume: number;
  replaceTypes?: string[];
}

export const DEFAULT_BLOCKS_PER_TICK = 384;

function splitBox(primitive: BoxPrimitive, budget: number): Batch[] {
  const result: Batch[] = [];
  const dx = primitive.to[0] - primitive.from[0] + 1;
  const dy = primitive.to[1] - primitive.from[1] + 1;
  const dz = primitive.to[2] - primitive.from[2] + 1;
  const chunkX = Math.max(1, Math.min(dx, budget));
  const chunkZ = Math.max(1, Math.min(dz, Math.floor(budget / chunkX) || 1));
  const chunkY = Math.max(1, Math.min(dy, Math.floor(budget / (chunkX * chunkZ)) || 1));

  for (let y = 0; y < dy; y += chunkY) {
    for (let z = 0; z < dz; z += chunkZ) {
      for (let x = 0; x < dx; x += chunkX) {
        const from: Vec3Tuple = [primitive.from[0] + x, primitive.from[1] + y, primitive.from[2] + z];
        const to: Vec3Tuple = [
          Math.min(primitive.to[0], from[0] + chunkX - 1),
          Math.min(primitive.to[1], from[1] + chunkY - 1),
          Math.min(primitive.to[2], from[2] + chunkZ - 1)
        ];
        const volume = (to[0] - from[0] + 1) * (to[1] - from[1] + 1) * (to[2] - from[2] + 1);
        result.push({ kind: "box", from, to, block: primitive.block, states: primitive.states, volume });
      }
    }
  }
  return result;
}

function setBatch(primitive: SetPrimitive): Batch {
  return { kind: "set", from: primitive.at, to: primitive.at, block: primitive.block, states: primitive.states, volume: 1 };
}

export function makeBatches(primitives: Primitive[], blocksPerTick = DEFAULT_BLOCKS_PER_TICK): Batch[] {
  if (!Number.isInteger(blocksPerTick) || blocksPerTick < 1) throw new Error("blocksPerTick must be a positive integer");
  return primitives.flatMap(primitive => primitive.kind === "box" ? splitBox(primitive, blocksPerTick) : [setBatch(primitive)]);
}

export function batchTotal(batches: Batch[]): number {
  return batches.reduce((sum, batch) => sum + batch.volume, 0);
}
