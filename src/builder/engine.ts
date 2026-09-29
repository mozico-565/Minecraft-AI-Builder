import { BlockPermutation, BlockTypes, BlockVolume, system, world, type Dimension, type Player } from "@minecraft/server";
import { compileBlueprint } from "../blueprint/compiler.js";
import type { Blueprint, Vec3Tuple } from "../blueprint/types.js";
import { validateBlueprint } from "../blueprint/validator.js";
import type { Rotation } from "../blueprint/transform.js";
import { clearActiveJob, loadActiveJob, saveActiveJob, type PersistedJob } from "../storage/state.js";
import { createUndoSnapshot, undoLast } from "../storage/undo.js";
import { addRecentAction, saveBuild } from "../memory/world-memory.js";
import { makeBatches, batchTotal, DEFAULT_BLOCKS_PER_TICK, type Batch } from "./scheduler.js";
import { calculateBounds, transformPrimitives } from "./world-transform.js";

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
}

export interface StartOptions {
  origin: Vec3Tuple;
  rotation: Rotation;
  blocksPerTick?: number;
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
  for (let x = from[0]; x <= to[0]; x += 16) {
    for (let z = from[2]; z <= to[2]; z += 16) {
      if (!dimension.isChunkLoaded({ x, y: from[1], z })) throw new Error("Build area contains unloaded chunks. Move closer and try again.");
    }
  }
  if (!dimension.isChunkLoaded({ x: to[0], y: from[1], z: to[2] })) throw new Error("Build area contains unloaded chunks. Move closer and try again.");
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
    if (this.job) throw new Error("Another build is already active");
    const validation = validateBlueprint(blueprint, undefined, id => BlockTypes.get(id) !== undefined);
    if (!validation.ok) throw new Error(validation.errors.join("; "));
    const primitives = transformPrimitives(compileBlueprint(blueprint), blueprint, vector(options.origin), options.rotation);
    const batches = makeBatches(primitives, options.blocksPerTick ?? DEFAULT_BLOCKS_PER_TICK);
    const bounds = calculateBounds(blueprint, vector(options.origin), options.rotation);
    checkWorldBounds(player.dimension, bounds.from, bounds.to);
    const snapshot = createUndoSnapshot(player.dimension, bounds.from, bounds.to, "build", blueprint.name);
    this.job = {
      ownerId: player.id,
      blueprint,
      label: blueprint.name,
      actionType: "build",
      dimension: player.dimension,
      origin: options.origin,
      rotation: options.rotation,
      batches,
      batchIndex: 0,
      blocksDone: 0,
      totalBlocks: batchTotal(batches),
      status: "running",
      undoId: snapshot.id,
      bounds
    };
    this.persist();
    player.sendMessage(`§aAI Builder: started ${blueprint.name} (${this.job.totalBlocks} block writes)`);
  }

  startWorldEdit(player: Player, options: WorldEditOptions): void {
    if (this.job) throw new Error("Another world action is already active");
    if (!options.batches.length) throw new Error("World edit contains no work");
    const totalBlocks = batchTotal(options.batches);
    if (totalBlocks > 25_000) throw new Error("World edit exceeds the 25,000 block mobile limit");
    checkWorldBounds(player.dimension, options.bounds.from, options.bounds.to);
    for (const batch of options.batches) {
      if (!BlockTypes.get(batch.block)) throw new Error(`Unknown block: ${batch.block}`);
      for (const filter of batch.replaceTypes ?? []) if (!BlockTypes.get(filter)) throw new Error(`Unknown replacement source block: ${filter}`);
    }
    const snapshot = createUndoSnapshot(player.dimension, options.bounds.from, options.bounds.to, options.actionType, options.label);
    this.job = {
      ownerId: player.id,
      label: options.label,
      actionType: options.actionType,
      dimension: player.dimension,
      origin: options.bounds.from,
      rotation: 0,
      batches: options.batches,
      batchIndex: 0,
      blocksDone: 0,
      totalBlocks,
      status: "running",
      undoId: snapshot.id,
      bounds: options.bounds
    };
    this.persist();
    player.sendMessage(`§aAI Assistant: started ${options.label} (${totalBlocks} maximum block writes)`);
  }

  pause(player?: Player): boolean {
    if (!this.job || this.job.status === "paused") return false;
    this.job.status = "paused";
    this.persist();
    player?.sendMessage("§eAI Assistant: action paused");
    return true;
  }

  resume(player?: Player): boolean {
    if (!this.job || this.job.status === "running") return false;
    this.job.status = "running";
    this.persist();
    player?.sendMessage("§aAI Assistant: action resumed");
    return true;
  }

  cancel(player?: Player): boolean {
    if (!this.job) return false;
    this.job = undefined;
    clearActiveJob();
    player?.sendMessage("§cAI Assistant: action cancelled. Use Undo to restore changed blocks.");
    return true;
  }

  undo(player?: Player): boolean {
    if (this.job) throw new Error("Pause or cancel the active build before Undo");
    const restored = undoLast();
    player?.sendMessage(restored ? "§aAI Assistant: last world action restored" : "§eAI Assistant: no undo snapshot available");
    return restored;
  }

  statusText(): string {
    if (!this.job) return "Minecraft AI Assistant: idle";
    const percent = Math.floor(this.job.blocksDone / Math.max(1, this.job.totalBlocks) * 100);
    return `AI Assistant: ${this.job.label} — ${this.job.status} ${percent}% (${this.job.blocksDone}/${this.job.totalBlocks})`;
  }

  hasPersistedJob(): boolean { return loadActiveJob() !== undefined; }

  restorePersisted(player: Player): void {
    if (this.job) throw new Error("A build is already active");
    const saved = loadActiveJob();
    if (!saved) throw new Error("No unfinished build was found");
    const dimension = world.getDimension(saved.dimensionId);
    let blueprint: Blueprint | undefined;
    let batches: Batch[];
    let bounds: { from: Vec3Tuple; to: Vec3Tuple };
    if (saved.kind !== "world_edit" && saved.blueprint) {
      if (!saved.blueprint) { clearActiveJob(); throw new Error("Saved blueprint is missing"); }
      const validation = validateBlueprint(saved.blueprint, undefined, id => BlockTypes.get(id) !== undefined);
      if (!validation.ok) { clearActiveJob(); throw new Error(`Saved build is invalid: ${validation.errors.join("; ")}`); }
      blueprint = saved.blueprint;
      const primitives = transformPrimitives(compileBlueprint(blueprint), blueprint, vector(saved.origin), saved.rotation);
      batches = makeBatches(primitives);
      bounds = calculateBounds(blueprint, vector(saved.origin), saved.rotation);
    } else {
      batches = saved.batches ?? [];
      if (!batches.length) { clearActiveJob(); throw new Error("Saved world edit is missing its batches"); }
      bounds = { from: saved.origin, to: batches.reduce<Vec3Tuple>((max, batch) => [Math.max(max[0], batch.to[0]), Math.max(max[1], batch.to[1]), Math.max(max[2], batch.to[2])], saved.origin) };
    }
    this.job = {
      ownerId: player.id,
      blueprint,
      label: saved.label ?? blueprint?.name ?? "Recovered action",
      actionType: saved.actionType ?? (blueprint ? "build" : "world_edit"),
      dimension,
      origin: saved.origin,
      rotation: saved.rotation,
      batches,
      batchIndex: Math.min(saved.batchIndex, batches.length),
      blocksDone: batches.slice(0, saved.batchIndex).reduce((sum, batch) => sum + batch.volume, 0),
      totalBlocks: batchTotal(batches),
      status: saved.status,
      undoId: saved.undoId,
      bounds
    };
    player.sendMessage(`§aAI Assistant: restored ${this.job.label}`);
  }

  discardPersisted(): void { clearActiveJob(); }

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
      undoId: this.job.undoId
    };
    if (!this.job.blueprint) saved.batches = this.job.batches;
    saveActiveJob(saved);
  }

  private tick(): void {
    const job = this.job;
    if (!job || job.status !== "running") return;
    const batch = job.batches[job.batchIndex];
    if (!batch) {
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
      const block = permutation(batch);
      if (batch.kind === "set" && !batch.replaceTypes?.length) job.dimension.setBlockPermutation(vector(batch.from), block);
      else job.dimension.fillBlocks(new BlockVolume(vector(batch.from), vector(batch.to)), block, batch.replaceTypes?.length ? { blockFilter: { includeTypes: batch.replaceTypes } } : undefined);
      job.batchIndex++;
      job.blocksDone += batch.volume;
      if (job.batchIndex % 20 === 0) this.persist();
      if (system.currentTick % 10 === 0) {
        const owner = getPlayer(job.ownerId);
        const percent = Math.floor(job.blocksDone / Math.max(1, job.totalBlocks) * 100);
        owner?.onScreenDisplay.setActionBar(`§b${job.label}… ${percent}% §7(${job.blocksDone}/${job.totalBlocks})`);
      }
    } catch (error) {
      job.status = "paused";
      this.persist();
      getPlayer(job.ownerId)?.sendMessage(`§cAI Assistant paused: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
