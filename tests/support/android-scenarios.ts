import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Player } from '@minecraft/server';
import * as api from './bedrock-1-21-100.js';
import { BuildingEngine } from '../../src/builder/engine.js';
import { NavigationService } from '../../src/navigation/service.js';
import { ToolRegistry } from '../../src/agent/registry.js';
import { validateBuildPlan } from '../../src/image/build-plan.js';
import { loadActiveJob } from '../../src/storage/state.js';
import { saveWaypoint, findWaypoint } from '../../src/memory/world-memory.js';

export async function run() {
  api.boot();
  const player = api.player as unknown as Player;
  const validation = validateBuildPlan(JSON.parse(await readFile('examples/vision/openrouter-m3-villa.buildplan.json', 'utf8')));
  const blueprint = validation.blueprint;
  let engine = new BuildingEngine();
  api.setLoaded(false);
  assert.throws(() => engine.start(player, blueprint, { origin: [0, 64, 0], rotation: 90 }), /unloaded/);
  api.setLoaded(true);
  engine.start(player, blueprint, { origin: [0, 64, 0], rotation: 90, conflictPolicy: 'pause_on_conflict' });
  api.ticks(1);
  assert.ok(loadActiveJob());
  engine.pause(player); const paused = engine.statusText(); api.ticks(5); assert.equal(engine.statusText(), paused);
  engine.resume(player); api.ticks(500); assert.equal(engine.isBusy, false);
  assert.equal(engine.undo(player), true);

  engine.start(player, blueprint, { origin: [0, 64, 0], rotation: 270, conflictPolicy: 'pause_on_conflict' });
  api.ticks(1); api.restartScheduler();
  engine = new BuildingEngine(); engine.restorePersisted(player); engine.resume(player); api.ticks(500);
  assert.equal(engine.isBusy, false); assert.equal(loadActiveJob(), undefined); assert.equal(engine.undo(player), true);

  engine.start(player, blueprint, { origin: [0, 64, 0], rotation: 0 });
  api.ticks(1); assert.equal(engine.cancel(player), true); assert.equal(engine.undo(player), true);
  engine.start(player, blueprint, { origin: [0, 64, 0], rotation: 0 });
  api.faults.fillAfter = 3; api.ticks(1); assert.match(engine.statusText(), /paused/);
  engine.resume(player); api.ticks(500); assert.equal(engine.isBusy, false); assert.equal(engine.undo(player), true);

  saveWaypoint({ name: 'البيت', dimensionId: api.dimension.id, coordinates: [0, 64, 100], type: 'place' });
  const navigation = new NavigationService(); navigation.start(player, findWaypoint('البيت')!); api.ticks(10);
  assert.ok(api.actionBars.some(s => s.includes('↑ البيت') && s.includes('100 blocks')));
  api.player.location = { x: 0, y: 64, z: 98 }; api.ticks(10); assert.equal(navigation.getDestination(player), undefined);
  const registry = new ToolRegistry();
  assert.match(registry.get('find_biome')!.validate({ biome: 'minecraft:ocean' }).join(), /unavailable/);
  assert.ok(registry.get('build_blueprint')); assert.ok(registry.get('fill_region')); assert.ok(registry.get('get_target_block'));
}
