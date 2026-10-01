import * as server from "@minecraft/server";
import type { Dimension, Player, Vector3 } from "@minecraft/server";

// Optional exports must be namespace lookups: named imports of newer APIs
// prevent the entire script from linking on Bedrock 1.21.100 / server 2.1.0.
interface OptionalServerApi {
  BiomeTypes?: { get(id: string): unknown };
  LocationWaypoint?: new (
    location: Vector3 & { dimension: Dimension },
    style: { textureBoundsList: Array<{ lowerBound: number; texture: string }> },
    color: { red: number; green: number; blue: number }
  ) => unknown;
  WaypointTexture?: { SmallStar: string };
}
interface OptionalLocatorBar {
  addWaypoint(marker: unknown): void;
  removeWaypoint(marker: unknown): void;
}
type OptionalDimension = Dimension & {
  isChunkLoaded?: (location: Vector3) => boolean;
  calculateClosestBiomeFromSeed?: (
    location: Vector3, biome: string, options: { boundingSize: Vector3 }
  ) => Vector3 | undefined;
};
const optional = server as unknown as OptionalServerApi;

export function isChunkLoaded(dimension: Dimension, location: Vector3): boolean {
  try {
    const native = (dimension as OptionalDimension).isChunkLoaded;
    if (typeof native === "function") return native.call(dimension, location);
    // getBlock is stable in 2.1.0: unloaded chunks throw or return undefined.
    // This reads one block per touched chunk; it never modifies or loads terrain.
    return dimension.getBlock(location) !== undefined;
  } catch { return false; }
}

export function addOptionalLocatorMarker(player: Player, location: Vector3 & { dimension: Dimension }): (() => void) | undefined {
  const Constructor = optional.LocationWaypoint;
  const texture = optional.WaypointTexture?.SmallStar;
  const bar = (player as Player & { locatorBar?: OptionalLocatorBar }).locatorBar;
  if (typeof Constructor !== "function" || texture === undefined || !bar) return undefined;
  const marker = new Constructor(location, { textureBoundsList: [{ lowerBound: 0, texture }] }, { red: 0.2, green: 1, blue: 0.55 });
  bar.addWaypoint(marker);
  return () => bar.removeWaypoint(marker);
}

export const BIOME_UNAVAILABLE = "Biome search is unavailable on Bedrock 1.21.100 (stable server 2.1.0). Saved-waypoint navigation remains available. / البحث عن المناطق الحيوية غير متاح في هذا الإصدار؛ التنقل للأماكن المحفوظة متاح.";

export function biomeErrors(value: unknown): string[] {
  if (!optional.BiomeTypes) return [BIOME_UNAVAILABLE];
  return typeof value === "string" && optional.BiomeTypes.get(value) ? [] : [`Unknown biome identifier: ${String(value)}`];
}

export function findBiome(dimension: Dimension, location: Vector3, biome: string): Vector3 | undefined {
  const lookup = (dimension as OptionalDimension).calculateClosestBiomeFromSeed;
  if (typeof lookup !== "function") throw new Error(BIOME_UNAVAILABLE);
  return lookup.call(dimension, location, biome, { boundingSize: { x: 4096, y: 384, z: 4096 } });
}
