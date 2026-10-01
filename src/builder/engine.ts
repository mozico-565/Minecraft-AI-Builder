import { planHash } from "../image/build-plan.js";
import { BlockPermutation, BlockTypes, BlockVolume, system, world, type Dimension, type Player } from "@minecraft/server";
import { compileBlueprint } from "../blueprint/compiler.js";
import type { Blueprint, Vec3Tuple } from "../blueprint/types.js";
import { validateBlueprint } from "../blueprint/validator.js";
import type { Rotation } from "../blueprint/transform.js";
import { assertCheckpointCapacity, clearActiveJob, loadActiveJob, saveActiveJob, type PersistedJob } from "../storage/state.js";
import { createUndoSnapshot, undoLast } from "../storage/undo.js";
import { addRecentAction, saveBuild } from "../memory/world-memory.js";
import { makeBatches, batchTotal, DEFAULT_BLOCKS_PER_TICK, type Batch } from "./scheduler.js";
import { calculateBounds, transformPrimitives } from "./world-transform.js";
import { isChunkLoaded } from "../runtime/compatibility.js";

export type JobStatus = "running" | "paused";

interface ActiveJob {
  ownerId: string;
  blueprint?: Blueprint;
  label: string;
  actionType: string;
  dimension: Dimension;
  origin: Vec3Tuple;
  rotation: Rotation;
  batches: Batch[];
  batchIndex: number;
  blocksDone: number;
  totalBlocks: number;
  status: JobStatus;
  undoId: string;
  bounds: { from: Vec3Tuple; to: Vec3Tuple };
  conflictPolicy?: "pause_on_conflict";
  fingerprint?: string;
  blocksPerTick?: number;
  verificationComplete?: boolean;
  pendingBatch?: number;
  replayAllowed?: Map<string,string>;
  expected?: Map<string,string>;
  verify?: Array<[string,string]>;
  verifyIndex?: number;
}

export interface StartOptions {
  origin: Vec3Tuple;
  rotation: Rotation;
  blocksPerTick?: number;
  conflictPolicy?: "pause_on_conflict";
}

export interface WorldEditOptions {
  label: string;
  actionType: "fill" | "replace" | "terrain_edit" | "structure";
  bounds: { from: Vec3Tuple; to: Vec3Tuple };
  batches: Batch[];
}

function vector(value: Vec3Tuple): { x: number; y: number; z: number } {
  return { x: value[0], y: value[1], z: value[2] };
}

function getPlayer(id: string): Player | undefined {
  return world.getAllPlayers().find(player => player.id === id);
}

function checkWorldBounds(dimension: Dimension, from: Vec3Tuple, to: Vec3Tuple): void {
  const range = dimension.heightRange;
  if (from[1] < range.min || to[1] >= range.max) throw new Error(`Build height must stay between ${range.min} and ${range.max - 1}`);
  for (let x = Math.floor(from[0]/16)*16; x <= to[0]; x += 16) {
    for (let z = Math.floor(from[2]/16)*16; z <= to[2]; z += 16) {
      if (!isChunkLoaded(dimension, { x, y: from[1], z })) throw new Error("Build area contains unloaded chunks. Move closer and try again.");
    }
  }
  if (!isChunkLoaded(dimension, { x: to[0], y: from[1], z: to[2] })) throw new Error("Build area contains unloaded chunks. Move closer and try again.");
}

function permutation(batch: Batch): BlockPermutation {
  return BlockPermutation.resolve(batch.block, batch.states);
}

export class BuildingEngine {
  private job?: ActiveJob;
  private intervalId?: number;

  constructor() {
    this.intervalId = system.runInterval(() => this.tick(), 1);
  }

  get isBusy(): boolean { return this.job !== undefined; }

  start(player: Player, blueprint: Blueprint, options: StartOptions): void {
    if (this.job || loadActiveJob()) throw new Error("An active or unfinished build exists; recover or cancel it first");
    if(options.blocksPerTick!==undefined && (!Number.isInteger(options.blocksPerTick)||options.blocksPerTick<1||options.blocksPerTick>DEFAULT_BLOCKS_PER_TICK))throw new Error("Batch budget must be 1-384");
    assertCheckpointCapacity({blueprint});
    const validation = validateBlueprint(blueprint, undefined, id => BlockTypes.get(id) !== undefined);
    if (!validation.ok) throw new Error(validation.errors.join("; "));
    const primitives = transformPrimitives(compileBlueprint(blueprint), blueprint, vector(options.origin), options.rotation);
    const batches = makeBatches(primitives, options.blocksPerTick ?? DEFAULT_BLOCKS_PER_TICK);
    const bounds = calculateBounds(blueprint, vector(options.origin), options.rotation);
    checkWorldBounds(player.dimension, bounds.from, bounds.to);
    for (const batch of batches) permutation(batch);
    const snapshot = createUndoSnapshot(player.dimension, bounds.from, bounds.to, "build", blueprint.name, player.id);
    this.job = {
      ownerId: player.id,
      blueprint,
      label: blueprint.name,
      actionType: "build",
      dimension: player.dimension,
      origin: options.origin,
      rotation: options.rotation,
      batches,
      fingerprint:batchFingerprint(batches),
      blocksPerTick:options.blocksPerTick??DEFAULT_BLOCKS_PER_TICK,
      batchIndex: 0,
      blocksDone: 0,
      totalBlocks: batchTotal(batches),
      status: "running",
      undoId: snapshot.id,
      bounds,
      conflictPolicy: options.conflictPolicy,
      expected: options.conflictPolicy ? new Map() : undefined
    };
    try{this.persist();}catch(error){this.job=undefined;throw error;}
    player.sendMessage(`§aAI Builder: started ${blueprint.name} (${this.job.totalBlocks} block writes)`);
  }

  startWorldEdit(player: Player, options: WorldEditOptions): void {
    if (this.job || loadActiveJob()) throw new Error("An active or unfinished action exists; recover or cancel it first");
    assertCheckpointCapacity({batches:options.batches});
    if (!options.batches.length) throw new Error("World edit contains no work");
    const totalBlocks = batchTotal(options.batches);
    if (totalBlocks > 25_000) throw new Error("World edit exceeds the 25,000 block mobile limit");
    checkWorldBounds(player.dimension, options.bounds.from, options.bounds.to);
    for (const batch of options.batches) {
      permutation(batch);
      if (!BlockTypes.get(batch.block)) throw new Error(`Unknown block: ${batch.block}`);
      for (const filter of batch.replaceTypes ?? []) if (!BlockTypes.get(filter)) throw new Error(`Unknown replacement source block: ${filter}`);
    }
    const snapshot = createUndoSnapshot(player.dimension, options.bounds.from, options.bounds.to, options.actionType, options.label, player.id);
    this.job = {
      ownerId: player.id,
      label: options.label,
      actionType: options.actionType,
      dimension: player.dimension,
      origin: options.bounds.from,
      rotation: 0,
      batches: options.batches,
      fingerprint:batchFingerprint(options.batches),
      batchIndex: 0,
      blocksDone: 0,
      totalBlocks,
      status: "running",
      undoId: snapshot.id,
      bounds: options.bounds
    };
    try{this.persist();}catch(error){this.job=undefined;throw error;}
    player.sendMessage(`§aAI Assistant: started ${options.label} (${totalBlocks} maximum block writes)`);
  }

  pause(player?: Player): boolean {
    if(this.job && player && player.id!==this.job.ownerId){player.sendMessage("§cThis action belongs to another player");return false;}
    if (!this.job || this.job.status === "paused") return false;
    this.job.status = "paused";
    this.persist();
    player?.sendMessage("§eAI Assistant: action paused");
    return true;
  }

  resume(player?: Player): boolean {
    if(this.job && player && player.id!==this.job.ownerId){player.sendMessage("§cThis action belongs to another player");return false;}
    if (!this.job || this.job.status === "running") return false;
    if(player && player.dimension.id!==this.job.dimension.id){player.sendMessage("§cReturn to the task dimension to resume");return false;}
    if(this.job.conflictPolicy){this.job.verify=[...(this.job.expected??[])];this.job.verifyIndex=0;this.job.verificationComplete=false;this.job.replayAllowed=pendingOverrides(this.job);}
    this.job.status = "running";
    this.persist();
    player?.sendMessage("§aAI Assistant: action resumed");
    return true;
  }

  cancel(player?: Player): boolean {
    if(this.job && player && player.id!==this.job.ownerId){player.sendMessage("§cThis action belongs to another player");return false;}
    if (!this.job) return false;
    this.job = undefined;
    clearActiveJob();
    player?.sendMessage("§cAI Assistant: action cancelled. Use Undo to restore changed blocks.");
    return true;
  }

  undo(player?: Player): boolean {
    if (this.job) throw new Error("Pause or cancel the active build before Undo");
    const restored = undoLast(player?.id);
    player?.sendMessage(restored ? "§aAI Assistant: last world action restored" : "§eAI Assistant: no undo snapshot available");
    return restored;
  }

  statusText(): string {
    if (!this.job) return "Minecraft AI Assistant: idle";
    const percent = Math.floor(this.job.blocksDone / Math.max(1, this.job.totalBlocks) * 100);
    return `AI Assistant: ${this.job.label} — ${this.job.status} ${percent}% (${this.job.blocksDone}/${this.job.totalBlocks})`;
  }

  hasPersistedJob(player?:Player): boolean {const saved=loadActiveJob();return !!saved && (!player || saved.ownerId===player.id);}

  restorePersisted(player: Player): void {
    if (this.job) throw new Error("A build is already active");
    const saved = loadActiveJob();
    if (!saved) throw new Error("No unfinished build was found");
    if(saved.ownerId!==player.id) throw new Error("This checkpoint belongs to another player");
    const dimension = world.getDimension(saved.dimensionId);
    if(player.dimension.id!==saved.dimensionId)throw new Error("Return to the task dimension before resuming");
    let blueprint: Blueprint | undefined;
    let batches: Batch[];
    let bounds: { from: Vec3Tuple; to: Vec3Tuple };
    if (saved.kind !== "world_edit" && saved.blueprint) {
      if (!saved.blueprint) { clearActiveJob(); throw new Error("Saved blueprint is missing"); }
      const validation = validateBlueprint(saved.blueprint, undefined, id => BlockTypes.get(id) !== undefined);
      if (!validation.ok) { clearActiveJob(); throw new Error(`Saved build is invalid: ${validation.errors.join("; ")}`); }
      blueprint = saved.blueprint;
      const primitives = transformPrimitives(compileBlueprint(blueprint), blueprint, vector(saved.origin), saved.rotation);
      if(saved.blocksPerTick!==undefined && (!Number.isInteger(saved.blocksPerTick)||saved.blocksPerTick<1||saved.blocksPerTick>DEFAULT_BLOCKS_PER_TICK))throw new Error("Invalid saved batch budget");
      batches = makeBatches(primitives,saved.blocksPerTick??DEFAULT_BLOCKS_PER_TICK);
      bounds = calculateBounds(blueprint, vector(saved.origin), saved.rotation);
    } else {
      batches = saved.batches ?? [];
      if (!batches.length) { clearActiveJob(); throw new Error("Saved world edit is missing its batches"); }
      bounds = { from: saved.origin, to: batches.reduce<Vec3Tuple>((max, batch) => [Math.max(max[0], batch.to[0]), Math.max(max[1], batch.to[1]), Math.max(max[2], batch.to[2])], saved.origin) };
    }
    if(!Number.isInteger(saved.batchIndex)||saved.batchIndex<0||saved.batchIndex>batches.length)throw new Error("Invalid checkpoint cursor");
    if(saved.pendingBatch!==undefined && saved.pendingBatch!==saved.batchIndex)throw new Error("Invalid pending batch journal");
    if(saved.fingerprint && saved.fingerprint!==batchFingerprint(batches) && saved.fingerprint!==planHash(batches) && saved.fingerprint!==planHash(batches.map(batch=>({...batch,states:batch.states}))) && saved.fingerprint!==planHash(batches.map(batch=>({...batch,states:batch.states,replaceTypes:batch.replaceTypes}))))throw new Error("Checkpoint plan changed; resume rejected");
    const expected=new Map<string,string>();
    if(saved.conflictPolicy)for(const batch of batches.slice(0,saved.batchIndex)){const wanted=signature(permutation(batch));forEachPosition(batch,key=>expected.set(key,wanted));}
    this.job = {
      ownerId: player.id,
      blueprint,
      label: saved.label ?? blueprint?.name ?? "Recovered action",
      actionType: saved.actionType ?? (blueprint ? "build" : "world_edit"),
      dimension,
      origin: saved.origin,
      rotation: saved.rotation,
      batches,
      fingerprint:batchFingerprint(batches),
      blocksPerTick:saved.blocksPerTick??DEFAULT_BLOCKS_PER_TICK,
      pendingBatch:saved.pendingBatch,
      batchIndex: Math.min(saved.batchIndex, batches.length),
      blocksDone: batches.slice(0, saved.batchIndex).reduce((sum, batch) => sum + batch.volume, 0),
      totalBlocks: batchTotal(batches),
      status: saved.status,
      undoId: saved.undoId,
      bounds, conflictPolicy:saved.conflictPolicy, expected, verify:saved.conflictPolicy?[...expected]:undefined, verifyIndex:0
    };
    this.job.replayAllowed=pendingOverrides(this.job);
    player.sendMessage(`§aAI Assistant: restored ${this.job.label}`);
  }

  discardPersisted(player?:Player): void {const saved=loadActiveJob();if(player && saved && saved.ownerId!==player.id)throw new Error("This checkpoint belongs to another player");if(this.job)throw new Error("Cancel the active action instead");clearActiveJob();}

  private persist(): void {
    if (!this.job) return;
    const saved: PersistedJob = {
      kind: this.job.blueprint ? "blueprint" : "world_edit",
      ownerId: this.job.ownerId,
      blueprint: this.job.blueprint,
      label: this.job.label,
      actionType: this.job.actionType,
      dimensionId: this.job.dimension.id,
      origin: this.job.origin,
      rotation: this.job.rotation,
      batchIndex: this.job.batchIndex,
      status: this.job.status,
      undoId: this.job.undoId,
      conflictPolicy:this.job.conflictPolicy,
      fingerprint:this.job.fingerprint,
      blocksPerTick:this.job.blocksPerTick,
      pendingBatch:this.job.pendingBatch
    };
    if (!this.job.blueprint) saved.batches = this.job.batches;
    saveActiveJob(saved);
  }

  private persistSafely():void {try{this.persist();}catch(error){const owner=this.job?getPlayer(this.job.ownerId):undefined;owner?.sendMessage("§cCheckpoint write failed; action remains paused. "+String(error));}}

  private tick(): void {
    const job = this.job;
    if (!job || job.status !== "running") return;
    const owner=getPlayer(job.ownerId);
    if(!owner || owner.dimension.id!==job.dimension.id){job.status="paused";this.persistSafely();owner?.sendMessage("§eAction paused: return to its dimension to resume");return;}
    if(job.verify && (job.verifyIndex??0)<job.verify.length){
      try {for(let n=0;n<384 && job.verifyIndex!<job.verify.length;n++){
        const [key,wanted]=job.verify[job.verifyIndex!]!;const [x,y,z]=key.split(",").map(Number);
        const current=job.dimension.getBlock({x:x!,y:y!,z:z!});
        const actual=current?signature(current.permutation):undefined;
        if(!current || (actual!==wanted && actual!==job.replayAllowed?.get(key)))throw new Error("PAUSED_CONFLICT: completed world state changed at "+key);
        job.verifyIndex!++;
      }if(job.verifyIndex===job.verify.length && job.batchIndex===job.batches.length)job.verificationComplete=true;}catch(error){job.status="paused";this.persistSafely();getPlayer(job.ownerId)?.sendMessage(String(error));}
      return;
    }
    const batch = job.batches[job.batchIndex];
    if (!batch) {
      if(job.conflictPolicy && !job.verificationComplete){job.verify=[...(job.expected??[])];job.verifyIndex=0;if(job.verify.length)return;job.verificationComplete=true;}
      const owner = getPlayer(job.ownerId);
      owner?.sendMessage(`§a✓ Action complete: ${job.label}`);
      owner?.onScreenDisplay.setActionBar("§a✓ AI Assistant complete");
      addRecentAction({ label: job.label, type: job.actionType, tick: system.currentTick });
      if (job.blueprint) saveBuild({ name: job.blueprint.name, dimensionId: job.dimension.id, origin: job.origin, bounds: job.bounds, rotation: job.rotation, createdAt: Date.now() });
      this.job = undefined;
      clearActiveJob();
      return;
    }
    try {
      checkWorldBounds(job.dimension,batch.from,batch.to);
      const block = permutation(batch);
      const wanted=job.conflictPolicy?signature(block):"";
      if(job.conflictPolicy)forEachPosition(batch,(key,pos)=>{
        const current=job.dimension.getBlock(pos);const actual=current && !current.isAir?signature(current.permutation):undefined;
        if(!current || (!current.isAir && actual!==wanted && actual!==job.expected?.get(key)))throw new Error("PAUSED_CONFLICT: occupied block at "+key+". Move/remove the obstacle before resuming.");
      });
      job.pendingBatch=job.batchIndex;
      this.persist(); // Write-ahead cursor: a crash/partial fill can replay this batch safely.
      if (batch.kind === "set" && !batch.replaceTypes?.length) job.dimension.setBlockPermutation(vector(batch.from), block);
      else job.dimension.fillBlocks(new BlockVolume(vector(batch.from), vector(batch.to)), block, batch.replaceTypes?.length ? { blockFilter: { includeTypes: batch.replaceTypes } } : undefined);
      if(job.conflictPolicy)forEachPosition(batch,key=>job.expected?.set(key,wanted));
      job.batchIndex++;
      job.pendingBatch=undefined;
      job.replayAllowed=undefined;
      job.blocksDone += batch.volume;
      this.persist();
      if (system.currentTick % 10 === 0) {
        const owner = getPlayer(job.ownerId);
        const percent = Math.floor(job.blocksDone / Math.max(1, job.totalBlocks) * 100);
        owner?.onScreenDisplay.setActionBar(`§b${job.label}… ${percent}% §7(${job.blocksDone}/${job.totalBlocks})`);
      }
    } catch (error) {
      job.status = "paused";
      this.persistSafely();
      getPlayer(job.ownerId)?.sendMessage(`§cAI Assistant paused: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function signature(p:BlockPermutation):string {return p.type.id+":"+planHash(p.getAllStates());}
function forEachPosition(batch:Batch,visit:(key:string,pos:{x:number;y:number;z:number})=>void):void {
  for(let x=batch.from[0];x<=batch.to[0];x++)for(let y=batch.from[1];y<=batch.to[1];y++)for(let z=batch.from[2];z<=batch.to[2];z++)visit([x,y,z].join(","),{x,y,z});
}

function pendingOverrides(job:ActiveJob):Map<string,string>|undefined {
 if(job.pendingBatch===undefined)return undefined;const batch=job.batches[job.pendingBatch];if(!batch)return undefined;
 const result=new Map<string,string>();const wanted=signature(permutation(batch));forEachPosition(batch,key=>result.set(key,wanted));return result;
}

// Persisted JSON drops undefined optional fields; hash its wire representation.
function batchFingerprint(batches:Batch[]):string{return planHash(JSON.parse(JSON.stringify(batches)));}
