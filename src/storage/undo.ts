import { StructureSaveMode, system, world, type Dimension } from "@minecraft/server";
import type { Vec3Tuple } from "../blueprint/types.js";
import { loadUndoHistory, saveUndoHistory, type UndoRecord } from "./state.js";

const MAX_STRUCTURE_AXIS = 64;
const MAX_UNDO = 3;

function tiles(from: Vec3Tuple, to: Vec3Tuple): Array<{ from: Vec3Tuple; to: Vec3Tuple }> {
  const result: Array<{ from: Vec3Tuple; to: Vec3Tuple }> = [];
  for (let y = from[1]; y <= to[1]; y += MAX_STRUCTURE_AXIS) {
    for (let z = from[2]; z <= to[2]; z += MAX_STRUCTURE_AXIS) {
      for (let x = from[0]; x <= to[0]; x += MAX_STRUCTURE_AXIS) {
        result.push({
          from: [x, y, z],
          to: [Math.min(to[0], x + 63), Math.min(to[1], y + 63), Math.min(to[2], z + 63)]
        });
      }
    }
  }
  return result;
}

function safeDelete(ids: string[]): void {
  for (const id of ids) {
    try { world.structureManager.delete(id); } catch { /* already missing */ }
  }
}

export function createUndoSnapshot(dimension: Dimension, from: Vec3Tuple, to: Vec3Tuple, actionType = "build", label?: string): UndoRecord {
  const id = `${system.currentTick}_${Math.floor(Math.random() * 1_000_000)}`;
  const structureIds: string[] = [];
  const tileOrigins: Vec3Tuple[] = [];
  try {
    tiles(from, to).forEach((tile, index) => {
      const structureId = `aibuilder:undo_${id}_${index}`;
      world.structureManager.createFromWorld(structureId, dimension, { x: tile.from[0], y: tile.from[1], z: tile.from[2] }, { x: tile.to[0], y: tile.to[1], z: tile.to[2] }, {
        includeBlocks: true,
        includeEntities: false,
        saveMode: StructureSaveMode.World
      });
      structureIds.push(structureId);
      tileOrigins.push(tile.from);
    });
  } catch (error) {
    safeDelete(structureIds);
    throw error;
  }

  const record: UndoRecord = { id, dimensionId: dimension.id, from, structureIds, tileOrigins, createdTick: system.currentTick, actionType, label };
  const history = loadUndoHistory();
  history.push(record);
  while (history.length > MAX_UNDO) {
    const expired = history.shift();
    if (expired) safeDelete(expired.structureIds);
  }
  saveUndoHistory(history);
  return record;
}

export function undoLast(): boolean {
  const history = loadUndoHistory();
  const record = history.pop();
  if (!record) return false;
  const dimension = world.getDimension(record.dimensionId);
  record.structureIds.forEach((id, index) => {
    const origin = record.tileOrigins[index];
    if (origin && world.structureManager.get(id)) world.structureManager.place(id, dimension, { x: origin[0], y: origin[1], z: origin[2] }, { includeBlocks: true, includeEntities: false });
  });
  safeDelete(record.structureIds);
  saveUndoHistory(history);
  return true;
}
