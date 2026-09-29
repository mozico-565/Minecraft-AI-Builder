import { LocationWaypoint, WaypointTexture, system, world, type Player } from "@minecraft/server";
import type { WaypointRecord } from "../memory/world-memory.js";

interface ActiveGuide { waypoint: WaypointRecord; marker: LocationWaypoint }

function distance(a: { x: number; y: number; z: number }, b: [number, number, number]): number {
  return Math.sqrt((a.x - b[0]) ** 2 + (a.y - b[1]) ** 2 + (a.z - b[2]) ** 2);
}

function directionArrow(player: Player, target: [number, number, number]): string {
  const view = player.getViewDirection();
  const dx = target[0] - player.location.x;
  const dz = target[2] - player.location.z;
  const length = Math.hypot(dx, dz) || 1;
  const tx = dx / length; const tz = dz / length;
  const forwardLength = Math.hypot(view.x, view.z) || 1;
  const fx = view.x / forwardLength; const fz = view.z / forwardLength;
  const angle = Math.atan2(fx * tz - fz * tx, fx * tx + fz * tz);
  const sector = Math.round(angle / (Math.PI / 4));
  return (["↓", "↘", "→", "↗", "↑", "↖", "←", "↙", "↓"] as const)[sector + 4] ?? "↑";
}

export class NavigationService {
  private guides = new Map<string, ActiveGuide>();

  constructor() {
    system.runInterval(() => this.update(), 10);
  }

  start(player: Player, waypoint: WaypointRecord): void {
    this.stop(player);
    const dimension = world.getDimension(waypoint.dimensionId);
    const marker = new LocationWaypoint(
      { dimension, x: waypoint.coordinates[0], y: waypoint.coordinates[1], z: waypoint.coordinates[2] },
      { textureBoundsList: [{ lowerBound: 0, texture: WaypointTexture.SmallStar }] },
      { red: 0.2, green: 1, blue: 0.55 }
    );
    player.locatorBar.addWaypoint(marker);
    this.guides.set(player.id, { waypoint, marker });
  }

  stop(player: Player): void {
    const current = this.guides.get(player.id);
    if (!current) return;
    try { player.locatorBar.removeWaypoint(current.marker); } catch { /* marker already invalid */ }
    this.guides.delete(player.id);
  }

  getDestination(player: Player): WaypointRecord | undefined { return this.guides.get(player.id)?.waypoint; }

  private update(): void {
    for (const player of world.getAllPlayers()) {
      const guide = this.guides.get(player.id);
      if (!guide) continue;
      if (player.dimension.id !== guide.waypoint.dimensionId) {
        player.onScreenDisplay.setActionBar(`§e${guide.waypoint.name} — different dimension`);
        continue;
      }
      const blocks = Math.round(distance(player.location, guide.waypoint.coordinates));
      const arrow = directionArrow(player, guide.waypoint.coordinates);
      player.onScreenDisplay.setActionBar(`§a${arrow} ${guide.waypoint.name} §f${blocks} blocks`);
      if (blocks <= 3) { player.sendMessage(`§a✓ Arrived at ${guide.waypoint.name}`); this.stop(player); }
    }
  }
}
