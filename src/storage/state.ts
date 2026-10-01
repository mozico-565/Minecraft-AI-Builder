import { planHash } from "../image/build-plan.js";
import { world } from "@minecraft/server";
import type { Blueprint, Vec3Tuple } from "../blueprint/types.js";
import type { Rotation } from "../blueprint/transform.js";

const ACTIVE_KEY = "aibuilder:active_job";
const UNDO_KEY = "aibuilder:undo_history";
const MAX_PROPERTY_LENGTH = 10_000; // <=30 KB UTF-8 even for Arabic; Bedrock property limit is 32 KB.

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
  conflictPolicy?: "pause_on_conflict";
  fingerprint?: string;
  blocksPerTick?: number;
  pendingBatch?: number;
}

export interface UndoRecord {
  id: string;
  dimensionId: string;
  from: Vec3Tuple;
  structureIds: string[];
  tileOrigins: Vec3Tuple[];
  createdTick: number;
  ownerId?: string;
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
  const head=readJson<{bank:number;count:number;hash:string;bodyKey?:string}|undefined>(ACTIVE_KEY+"_head",undefined);
  if(!head) return readJson<PersistedJob|undefined>(ACTIVE_KEY,undefined);
  if(!Number.isInteger(head.count)||head.count<1||head.count>16||![0,1].includes(head.bank)) throw new Error("Invalid checkpoint header");
  let data="";
  for(let i=0;i<head.count;i++){const part=world.getDynamicProperty(ACTIVE_KEY+"_"+head.bank+"_"+i);if(typeof part!=="string")throw new Error("Checkpoint is incomplete");data+=part;}
  if(planHash(data)!==head.hash) throw new Error("Checkpoint integrity failed");
  const saved=JSON.parse(data) as PersistedJob;
  const progress=readJson<{bodyKey:string;batchIndex:number;status:PersistedJob['status'];pendingBatch?:number}|undefined>(ACTIVE_KEY+"_progress",undefined);
  if(progress && progress.bodyKey===head.bodyKey){saved.batchIndex=progress.batchIndex;saved.status=progress.status;saved.pendingBatch=progress.pendingBatch;}
  return saved;
}

export function assertCheckpointCapacity(value:unknown):void {if(JSON.stringify(value).length+2000>MAX_PROPERTY_LENGTH*16)throw new Error("Checkpoint exceeds mobile storage budget");}

export function saveActiveJob(job: PersistedJob): void {
  const bodyKey=job.undoId+":"+job.fingerprint;
  const head=readJson<{bank:number;bodyKey?:string}|undefined>(ACTIVE_KEY+"_head",undefined);
  if(head?.bodyKey===bodyKey){writeJson(ACTIVE_KEY+"_progress",{bodyKey,batchIndex:job.batchIndex,status:job.status,pendingBatch:job.pendingBatch});return;}
  const data=JSON.stringify(job);const count=Math.ceil(data.length/MAX_PROPERTY_LENGTH);
  if(count>16)throw new Error("Checkpoint exceeds mobile storage budget");
  const old=readJson<{bank:number}|undefined>(ACTIVE_KEY+"_head",undefined);const bank=old?.bank===0?1:0;
  for(let i=0;i<count;i++)world.setDynamicProperty(ACTIVE_KEY+"_"+bank+"_"+i,data.slice(i*MAX_PROPERTY_LENGTH,(i+1)*MAX_PROPERTY_LENGTH));
  writeJson(ACTIVE_KEY+"_head",{bank,count,hash:planHash(data),bodyKey});
}
export function clearActiveJob(): void { world.setDynamicProperty(ACTIVE_KEY, undefined); world.setDynamicProperty(ACTIVE_KEY+"_head",undefined);world.setDynamicProperty(ACTIVE_KEY+"_progress",undefined); for(let bank=0;bank<2;bank++)for(let i=0;i<16;i++)world.setDynamicProperty(ACTIVE_KEY+"_"+bank+"_"+i,undefined); }
export function loadUndoHistory(): UndoRecord[] { return readJson<UndoRecord[]>(UNDO_KEY, []); }
export function saveUndoHistory(history: UndoRecord[]): void { writeJson(UNDO_KEY, history); }
