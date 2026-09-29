import { system, type Dimension } from "@minecraft/server";
import type { Vec3Tuple } from "../blueprint/types.js";

function edgePoints(from: Vec3Tuple, to: Vec3Tuple): Vec3Tuple[] {
  const lengths: [number, number, number] = [to[0] - from[0] + 1, to[1] - from[1] + 1, to[2] - from[2] + 1];
  const step = Math.max(1, Math.ceil((lengths[0] + lengths[1] + lengths[2]) * 4 / 120));
  const points: Vec3Tuple[] = [];
  const add = (x: number, y: number, z: number) => points.push([x + 0.5, y + 0.5, z + 0.5]);
  for (let x = from[0]; x <= to[0]; x += step) for (const y of [from[1], to[1]]) for (const z of [from[2], to[2]]) add(x, y, z);
  for (let y = from[1]; y <= to[1]; y += step) for (const x of [from[0], to[0]]) for (const z of [from[2], to[2]]) add(x, y, z);
  for (let z = from[2]; z <= to[2]; z += step) for (const x of [from[0], to[0]]) for (const y of [from[1], to[1]]) add(x, y, z);
  return points.slice(0, 160);
}

export function showPreview(dimension: Dimension, from: Vec3Tuple, to: Vec3Tuple, durationTicks = 200): void {
  const points = edgePoints(from, to);
  const start = system.currentTick;
  const id = system.runInterval(() => {
    if (system.currentTick - start >= durationTicks) { system.clearRun(id); return; }
    for (const point of points) {
      try { dimension.spawnParticle("minecraft:basic_flame_particle", { x: point[0], y: point[1], z: point[2] }); } catch { /* unsupported particle: preview simply stops drawing */ }
    }
  }, 10);
}
