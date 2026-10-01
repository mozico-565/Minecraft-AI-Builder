// TEST ONLY: stable 2.1.0 API surface double. Deliberately omits newer exports.
import * as base from './minecraft-mock.js';
export { BlockPermutation, BlockTypes, BlockVolume, StructureSaveMode } from './minecraft-mock.js';
export enum CommandPermissionLevel { Any = 0, GameDirectors = 1, Admin = 2, Host = 3, Owner = 4 }
export enum Direction { Down = 'Down', Up = 'Up', East = 'East', West = 'West', North = 'North', South = 'South' }
export class Player {}
let ready = false;
const scheduled = new Map<number, { fn: () => void; period: number; next: number }>();
let nextId = 1;
const handlers = { startup: [] as Array<(event: unknown) => void>, spawn: [] as Array<(event: unknown) => void>, item: [] as Array<(event: unknown) => void> };
export const commands = new Map<string, { definition: Record<string, unknown>; execute: (origin: unknown) => unknown }>();
function schedule(fn: () => void, period: number, delay: number) { const id = nextId++; scheduled.set(id, { fn, period, next: system.currentTick + delay }); return id; }
export const system = {
  currentTick: 0,
  beforeEvents: { startup: { subscribe(fn: (event: unknown) => void) { handlers.startup.push(fn); } } },
  run(fn: () => void) { return schedule(fn, 0, 1); },
  runTimeout(fn: () => void, delay = 1) { return schedule(fn, 0, delay); },
  runInterval(fn: () => void, period = 1) { return schedule(fn, period, period); },
  clearRun(id: number) { scheduled.delete(id); }
};
const { isChunkLoaded: _newerApi, ...stableDimension } = base.dimension;
export const dimension = stableDimension;
const playerProperties = new Map<string, unknown>();
export const actionBars: string[] = [];
export const player = Object.assign(base.player, {
  dimension, location: { x: 0, y: 64, z: 0 },
  getViewDirection: () => ({ x: 0, y: 0, z: 1 }),
  getBlockFromViewDirection: () => undefined,
  getDynamicProperty: (key: string) => playerProperties.get(key),
  setDynamicProperty: (key: string, value: unknown) => playerProperties.set(key, value),
  onScreenDisplay: { setActionBar(text: string) { actionBars.push(text); } }
});
Object.setPrototypeOf(player, Player.prototype);
function assertReady() { if (!ready) throw new Error('World API used during early execution'); }
export const world = {
  ...base.world,
  afterEvents: {
    playerSpawn: { subscribe(fn: (event: unknown) => void) { handlers.spawn.push(fn); } },
    itemUse: { subscribe(fn: (event: unknown) => void) { handlers.item.push(fn); } }
  },
  getAllPlayers() { assertReady(); return [player]; },
  getDimension(_id: string) { assertReady(); return dimension; },
  getDynamicProperty(key: string) { assertReady(); return base.world.getDynamicProperty(key); },
  setDynamicProperty(key: string, value: unknown) { assertReady(); return base.world.setDynamicProperty(key, value); }
};
export function boot() {
  const registry = { registerCommand(definition: Record<string, unknown>, execute: (origin: unknown) => unknown) {
    const name = String(definition.name); if (commands.has(name)) throw new Error('Duplicate command');
    commands.set(name, { definition, execute });
  } };
  for (const fn of handlers.startup) fn({ customCommandRegistry: registry });
  ready = true;
  for (const fn of handlers.spawn) fn({ initialSpawn: true, player });
}
export function ticks(count: number) {
  for (let n = 0; n < count; n++) {
    system.currentTick++;
    for (const [id, job] of [...scheduled]) if (job.next <= system.currentTick) {
      if (!job.period) scheduled.delete(id); else job.next += job.period;
      job.fn();
    }
  }
}
export function setLoaded(value: boolean) { base.dimension.loaded = value; }
export const faults = base.faults;
export function restartScheduler() { scheduled.clear(); }
export function useCompass() { for (const fn of handlers.item) fn({ source: Object.assign(player, { isSneaking: true }), itemStack: { typeId: 'minecraft:compass' } }); }
