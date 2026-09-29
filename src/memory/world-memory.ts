import { system, world } from "@minecraft/server";
import type { Vec3Tuple } from "../blueprint/types.js";

const WAYPOINTS_KEY = "aiassistant:waypoints";
const BUILDS_KEY = "aiassistant:builds";
const RECENT_KEY = "aiassistant:recent";
const MAX_WAYPOINTS = 64;
const MAX_BUILDS = 32;
const MAX_RECENT = 20;

export interface WaypointRecord {
  name: string;
  dimensionId: string;
  coordinates: Vec3Tuple;
  bounds?: { from: Vec3Tuple; to: Vec3Tuple };
  type: "place" | "build" | "biome";
  createdAt: number;
}

export interface BuildRecord {
  name: string;
  dimensionId: string;
  origin: Vec3Tuple;
  bounds: { from: Vec3Tuple; to: Vec3Tuple };
  rotation: number;
  createdAt: number;
}

export interface RecentAction {
  label: string;
  type: string;
  tick: number;
}

function read<T>(key: string, fallback: T): T {
  const raw = world.getDynamicProperty(key);
  if (typeof raw !== "string") return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function write(key: string, value: unknown): void { world.setDynamicProperty(key, JSON.stringify(value)); }
function sameName(a: string, b: string): boolean { return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase(); }

export function listWaypoints(): WaypointRecord[] { return read<WaypointRecord[]>(WAYPOINTS_KEY, []); }

export function saveWaypoint(record: Omit<WaypointRecord, "createdAt">): WaypointRecord {
  const name = record.name.trim().slice(0, 40);
  if (!name) throw new Error("Waypoint name is required");
  const saved: WaypointRecord = { ...record, name, createdAt: Date.now() };
  const list = listWaypoints().filter(item => !sameName(item.name, name));
  list.push(saved);
  write(WAYPOINTS_KEY, list.slice(-MAX_WAYPOINTS));
  addRecentAction({ label: `Saved waypoint ${name}`, type: "waypoint", tick: system.currentTick });
  return saved;
}

export function findWaypoint(name: string): WaypointRecord | undefined {
  return listWaypoints().find(item => sameName(item.name, name));
}

export function removeWaypoint(name: string): boolean {
  const list = listWaypoints();
  const next = list.filter(item => !sameName(item.name, name));
  if (next.length === list.length) return false;
  write(WAYPOINTS_KEY, next);
  return true;
}

export function listBuilds(): BuildRecord[] { return read<BuildRecord[]>(BUILDS_KEY, []); }

export function saveBuild(record: BuildRecord): void {
  const list = listBuilds();
  list.push(record);
  write(BUILDS_KEY, list.slice(-MAX_BUILDS));
}

export function addRecentAction(action: RecentAction): void {
  const list = read<RecentAction[]>(RECENT_KEY, []);
  list.push(action);
  write(RECENT_KEY, list.slice(-MAX_RECENT));
}

export function listRecentActions(): RecentAction[] { return read<RecentAction[]>(RECENT_KEY, []); }
