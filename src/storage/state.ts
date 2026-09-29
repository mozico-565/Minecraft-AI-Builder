import { world } from "@minecraft/server";
import type { Blueprint, Vec3Tuple } from "../blueprint/types.js";
import type { Rotation } from "../blueprint/transform.js";

const ACTIVE_KEY = "aibuilder:active_job";
const UNDO_KEY = "aibuilder:undo_history";
const MAX_PROPERTY_LENGTH = 30_000;

export interface PersistedJob {
  kind: "blueprint" | "world_edit";
  ownerId: string;
  blueprint?: Blueprint;
  label: string;
  actionType: string;
  dimensionId: string;
  origin: Vec3Tuple;
  rotation: Rotation;
  batches?: import("../builder/scheduler.js").Batch[];
  batchIndex: number;
  status: "running" | "paused";
  undoId: string;
}

export interface UndoRecord {
  id: string;
  dimensionId: string;
  from: Vec3Tuple;
  structureIds: string[];
  tileOrigins: Vec3Tuple[];
  createdTick: number;
  actionType?: string;
  label?: string;
}

function readJson<T>(key: string, fallback: T): T {
  const value = world.getDynamicProperty(key);
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function writeJson(key: string, value: unknown): void {
  const encoded = JSON.stringify(value);
  if (encoded.length > MAX_PROPERTY_LENGTH) throw new Error(`Persistent state exceeds ${MAX_PROPERTY_LENGTH} characters`);
  world.setDynamicProperty(key, encoded);
}

export function loadActiveJob(): PersistedJob | undefined {
  return readJson<PersistedJob | undefined>(ACTIVE_KEY, undefined);
}

export function saveActiveJob(job: PersistedJob): void { writeJson(ACTIVE_KEY, job); }
export function clearActiveJob(): void { world.setDynamicProperty(ACTIVE_KEY, undefined); }
export function loadUndoHistory(): UndoRecord[] { return readJson<UndoRecord[]>(UNDO_KEY, []); }
export function saveUndoHistory(history: UndoRecord[]): void { writeJson(UNDO_KEY, history); }
