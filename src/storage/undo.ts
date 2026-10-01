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

export function createUndoSnapshot(dimension: Dimension, from: Vec3Tuple, to: Vec3Tuple, actionType = "build", label?: string, ownerId?: string): UndoRecord {
  if ((to[0]-from[0]+1)*(to[1]-from[1]+1)*(to[2]-from[2]+1)>100000) throw new Error("Undo bounding volume exceeds 100,000 block safety limit");
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

  const record: UndoRecord = { id, dimensionId: dimension.id, from, structureIds, tileOrigins, createdTick: system.currentTick, actionType, label, ownerId };
  const history = loadUndoHistory();
  history.push(record);
  const expiredRecords:UndoRecord[]=[];
  while (history.length > MAX_UNDO) {
    const expired = history.shift();
    if (expired) expiredRecords.push(expired);
  }
  try{saveUndoHistory(history);}catch(error){safeDelete(structureIds);throw error;}
  expiredRecords.forEach(record=>safeDelete(record.structureIds));
  return record;
}

export function undoLast(ownerId?:string): boolean {
  const history = loadUndoHistory();
  const record = history.pop();
  if (!record) return false;
  if(ownerId && record.ownerId && ownerId!==record.ownerId)throw new Error("Last action belongs to another player");
  const dimension = world.getDimension(record.dimensionId);
  if (record.structureIds.some(id => !world.structureManager.get(id))) throw new Error("Undo snapshot is incomplete; history retained");
  record.structureIds.forEach((id, index) => {
    const origin = record.tileOrigins[index];
    if (origin && world.structureManager.get(id)) world.structureManager.place(id, dimension, { x: origin[0], y: origin[1], z: origin[2] }, { includeBlocks: true, includeEntities: false });
  });
  saveUndoHistory(history);
  safeDelete(record.structureIds);
  return true;
}
