import { BiomeTypes, BlockTypes, Direction, system, type Player } from "@minecraft/server";
import { SAFE_BLOCK_SET, isBlockIdentifier } from "../blueprint/blocks.js";
import { playerFacingRotation, rotatedSize, type Rotation } from "../blueprint/transform.js";
import type { Blueprint, Vec3Tuple } from "../blueprint/types.js";
import { validateBlueprint } from "../blueprint/validator.js";
import { makeBatches, type Batch } from "../builder/scheduler.js";
import { calculateBounds } from "../builder/world-transform.js";
import { findWaypoint, listWaypoints, saveWaypoint } from "../memory/world-memory.js";
import { MAX_ACTION_BLOCKS, MAX_RAY_DISTANCE, isRecord, regionVolume, riskForBlocks } from "./policy.js";
import type { BuildToolArguments, ToolAssessment, ToolDefinition, ToolExecutionContext, ToolResult } from "./types.js";

const objectSchema = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({ type: "object", additionalProperties: false, properties, required });
const targetSchema = { type: "string", enum: ["player", "crosshair"] };
const blockSchema = { type: "string", pattern: "^minecraft:[a-z0-9_]+$" };
const sizeSchema = objectSchema({ x: { type: "integer", minimum: 1, maximum: 128 }, y: { type: "integer", minimum: 1, maximum: 64 }, z: { type: "integer", minimum: 1, maximum: 128 } }, ["x", "y", "z"]);

function ok(tool: string, message: string, data?: Record<string, unknown>): ToolResult { return { ok: true, tool, message, data }; }
function errorListForBlock(value: unknown, field = "block"): string[] {
  if (typeof value !== "string" || !isBlockIdentifier(value)) return [`${field} must be a namespaced Minecraft block identifier`];
  if (!SAFE_BLOCK_SET.has(value) || !BlockTypes.get(value)) return [`${field} is not in the mobile-safe block allowlist: ${value}`];
  return [];
}
function stringError(value: unknown, field: string, max = 80): string[] { return typeof value === "string" && value.trim().length > 0 && value.length <= max ? [] : [`${field} must be 1-${max} characters`]; }
function targetError(value: unknown): string[] { return value === "player" || value === "crosshair" || value === undefined ? [] : ["target must be player or crosshair"]; }
function sizeErrors(value: unknown): string[] {
  const volume = regionVolume(value);
  if (!isRecord(value) || !volume) return ["size must contain positive integer x, y and z values"];
  if (Number(value.x) > 128 || Number(value.y) > 64 || Number(value.z) > 128) return ["size exceeds 128×64×128 axis limits"];
  return volume > MAX_ACTION_BLOCKS ? [`region volume exceeds the ${MAX_ACTION_BLOCKS} block limit`] : [];
}
function floorLocation(player: Player): Vec3Tuple { return [Math.floor(player.location.x), Math.floor(player.location.y), Math.floor(player.location.z)]; }
function viewHit(player: Player, maxDistance = 16) {
  return player.getBlockFromViewDirection({ maxDistance: Math.max(1, Math.min(MAX_RAY_DISTANCE, maxDistance)), includeLiquidBlocks: true, includePassableBlocks: true });
}
function faceOffset(face: Direction): Vec3Tuple {
  switch (face) {
    case Direction.Down: return [0, -1, 0];
    case Direction.Up: return [0, 1, 0];
    case Direction.East: return [1, 0, 0];
    case Direction.West: return [-1, 0, 0];
    case Direction.North: return [0, 0, 1];
    case Direction.South: return [0, 0, -1];
  }
}
function targetPosition(player: Player, target: unknown, adjacent = false): Vec3Tuple {
  if (target === "crosshair") {
    const hit = viewHit(player);
    if (!hit) throw new Error(`No target block found within 16 blocks`);
    const base: Vec3Tuple = [hit.block.location.x, hit.block.location.y, hit.block.location.z];
    if (!adjacent) return base;
    const offset = faceOffset(hit.face);
    return [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]];
  }
  const position = floorLocation(player);
  return [position[0], position[1] - 1, position[2]];
}
function regionBounds(player: Player, args: Record<string, unknown>): { from: Vec3Tuple; to: Vec3Tuple } {
  const center = targetPosition(player, args.target);
  const size = args.size as { x: number; y: number; z: number };
  const from: Vec3Tuple = [center[0] - Math.floor((size.x - 1) / 2), center[1] - Math.floor((size.y - 1) / 2), center[2] - Math.floor((size.z - 1) / 2)];
  return { from, to: [from[0] + size.x - 1, from[1] + size.y - 1, from[2] + size.z - 1] };
}
function regionBatches(from: Vec3Tuple, to: Vec3Tuple, block: string, replaceTypes?: string[]): Batch[] {
  return makeBatches([{ kind: "box", from, to, block }], 384).map(batch => ({ ...batch, replaceTypes }));
}
function regionAssessment(args: Record<string, unknown>, verb: string): ToolAssessment {
  const blocks = regionVolume(args.size);
  return { risk: riskForBlocks(blocks), estimatedBlocks: blocks, summary: `${verb} ${blocks} blocks (${(args.size as {x:number;y:number;z:number})?.x ?? "?"}×${(args.size as {x:number;y:number;z:number})?.y ?? "?"}×${(args.size as {x:number;y:number;z:number})?.z ?? "?"})`, worldChanging: true };
}
function startRegion(context: ToolExecutionContext, args: Record<string, unknown>, replaceTypes?: string[]): ToolResult {
  const bounds = regionBounds(context.player, args);
  const block = String(args.block);
  const label = replaceTypes?.length ? `Replace ${replaceTypes.join(", ")} with ${block}` : `Fill region with ${block}`;
  context.engine.startWorldEdit(context.player, { label, actionType: replaceTypes?.length ? "replace" : "fill", bounds, batches: regionBatches(bounds.from, bounds.to, block, replaceTypes) });
  return ok(replaceTypes?.length ? "replace_region" : "fill_region", `${label} started`, { bounds, maximumWrites: regionVolume(args.size) });
}

const TREE_BLUEPRINT: Blueprint = {
  version: 1, name: "Oak Tree", size: { x: 5, y: 7, z: 5 },
  operations: [
    { type: "column", at: [2, 0, 2], height: 5, block: "minecraft:oak_log" },
    { type: "fill", from: [1, 3, 1], to: [3, 5, 3], block: "minecraft:oak_leaves" },
    { type: "fill", from: [0, 4, 2], to: [4, 4, 2], block: "minecraft:oak_leaves" },
    { type: "fill", from: [2, 4, 0], to: [2, 4, 4], block: "minecraft:oak_leaves" },
    { type: "set_block", at: [2, 6, 2], block: "minecraft:oak_leaves" }
  ]
};

function buildOrigin(player: Player, args: BuildToolArguments): { origin: Vec3Tuple; rotation: Rotation } {
  const blueprint = args.blueprint;
  const rotation = args.rotation === "facing" || args.rotation === undefined ? playerFacingRotation(player.getViewDirection()) : args.rotation;
  const position = floorLocation(player);
  if (args.placement === "crosshair") return { origin: targetPosition(player, "crosshair", true), rotation };
  if (args.placement !== "front") return { origin: [position[0], position[1] - 1, position[2]], rotation };
  const size = rotatedSize(blueprint.size, rotation);
  const view = player.getViewDirection();
  const distance = Math.ceil(Math.max(size.x, size.z) / 2) + 4;
  const centerX = position[0] + Math.round(view.x * distance);
  const centerZ = position[2] + Math.round(view.z * distance);
  return { origin: [centerX - Math.floor(size.x / 2), position[1] - 1, centerZ - Math.floor(size.z / 2)], rotation };
}

export function previewBoundsForCall(player: Player, tool: string, args: Record<string, unknown>): { from: Vec3Tuple; to: Vec3Tuple } | undefined {
  if (tool === "fill_region" || tool === "replace_region") return regionBounds(player, args);
  if (tool === "place_block") { const at = targetPosition(player, args.target, args.mode === "adjacent"); return { from: at, to: at }; }
  if (tool === "build_blueprint" && isRecord(args.blueprint)) {
    const typed = args as unknown as BuildToolArguments;
    const selected = buildOrigin(player, typed);
    return calculateBounds(typed.blueprint, { x: selected.origin[0], y: selected.origin[1], z: selected.origin[2] }, selected.rotation);
  }
  return undefined;
}

export function createToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "get_player_position", description: "Read the player's current dimension, block position and look direction.", inputSchema: objectSchema({}),
      validate: () => [], assess: () => ({ risk: "LOW", estimatedBlocks: 0, summary: "Read player position", worldChanging: false }),
      execute: ({ player }) => ok("get_player_position", "Player position read", { dimensionId: player.dimension.id, position: floorLocation(player), direction: player.getViewDirection() })
    },
    {
      name: "get_target_block", description: "Raycast from the player's crosshair to a block, up to 32 blocks away.", inputSchema: objectSchema({ maxDistance: { type: "integer", minimum: 1, maximum: MAX_RAY_DISTANCE } }),
      validate: args => args.maxDistance === undefined || (Number.isInteger(args.maxDistance) && Number(args.maxDistance) >= 1 && Number(args.maxDistance) <= MAX_RAY_DISTANCE) ? [] : [`maxDistance must be 1-${MAX_RAY_DISTANCE}`],
      assess: () => ({ risk: "LOW", estimatedBlocks: 0, summary: "Inspect crosshair target", worldChanging: false }),
      execute: ({ player }, args) => { const hit = viewHit(player, Number(args.maxDistance ?? 16)); return hit ? ok("get_target_block", `Target is ${hit.block.typeId}`, { position: [hit.block.location.x, hit.block.location.y, hit.block.location.z], typeId: hit.block.typeId, face: hit.face }) : { ok: false, tool: "get_target_block", message: "No target block found" }; }
    },
    {
      name: "place_block", description: "Place one allowlisted block at the player or crosshair target.", inputSchema: objectSchema({ block: blockSchema, target: targetSchema, mode: { type: "string", enum: ["replace", "adjacent"] } }, ["block", "target"]),
      validate: args => [...errorListForBlock(args.block), ...targetError(args.target), ...(args.mode === undefined || args.mode === "replace" || args.mode === "adjacent" ? [] : ["mode must be replace or adjacent"])],
      assess: args => ({ risk: "LOW", estimatedBlocks: 1, summary: `Place ${String(args.block)} at ${String(args.target)}`, worldChanging: true }),
      execute: (context, args) => { const at = targetPosition(context.player, args.target, args.mode === "adjacent"); context.engine.startWorldEdit(context.player, { label: `Place ${String(args.block)}`, actionType: "fill", bounds: { from: at, to: at }, batches: [{ kind: "set", from: at, to: at, block: String(args.block), volume: 1 }] }); return ok("place_block", `Placing ${String(args.block)}`, { position: at }); }
    },
    {
      name: "place_feature", description: "Place a small deterministic local feature. Version 0.1 supports tree.", inputSchema: objectSchema({ feature: { type: "string", enum: ["tree"] }, target: targetSchema }, ["feature", "target"]),
      validate: args => [...(args.feature === "tree" ? [] : ["Only the tree feature is supported in v0.1"]), ...targetError(args.target)],
      assess: () => ({ risk: "LOW", estimatedBlocks: 40, summary: "Place an oak tree", worldChanging: true }),
      execute: (context, args) => { const base = args.target === "crosshair" ? targetPosition(context.player, "crosshair", true) : floorLocation(context.player); const origin: Vec3Tuple = [base[0] - 2, base[1], base[2] - 2]; context.engine.start(context.player, TREE_BLUEPRINT, { origin, rotation: 0 }); return ok("place_feature", "Oak tree build started", { origin }); }
    },
    {
      name: "fill_region", description: "Fill a bounded region using batching. Maximum 25,000 blocks.", inputSchema: objectSchema({ target: targetSchema, size: sizeSchema, block: blockSchema }, ["target", "size", "block"]),
      validate: args => [...targetError(args.target), ...sizeErrors(args.size), ...errorListForBlock(args.block)], assess: args => regionAssessment(args, `Fill with ${String(args.block)}`), execute: (context, args) => startRegion(context, args)
    },
    {
      name: "replace_region", description: "Replace selected source blocks in a bounded region using a stable block filter.", inputSchema: objectSchema({ target: targetSchema, size: sizeSchema, sourceBlocks: { type: "array", minItems: 1, maxItems: 8, items: blockSchema }, block: blockSchema }, ["target", "size", "sourceBlocks", "block"]),
      validate: args => [...targetError(args.target), ...sizeErrors(args.size), ...errorListForBlock(args.block), ...(Array.isArray(args.sourceBlocks) && args.sourceBlocks.length >= 1 && args.sourceBlocks.length <= 8 ? args.sourceBlocks.flatMap((item, index) => errorListForBlock(item, `sourceBlocks[${index}]`)) : ["sourceBlocks must contain 1-8 block identifiers"])],
      assess: args => regionAssessment(args, `Replace blocks with ${String(args.block)}`), execute: (context, args) => startRegion(context, args, args.sourceBlocks as string[])
    },
    {
      name: "build_blueprint", description: "Validate and build a Blueprint v1 through the existing safe Builder engine.", inputSchema: objectSchema({ blueprint: { type: "object" }, placement: { type: "string", enum: ["here", "front", "crosshair"] }, rotation: { oneOf: [{ type: "integer", enum: [0, 90, 180, 270] }, { const: "facing" }] } }, ["blueprint"]),
      validate: args => { const result = validateBlueprint(args.blueprint); return [...result.errors, ...(args.placement === undefined || ["here", "front", "crosshair"].includes(String(args.placement)) ? [] : ["Invalid build placement"]), ...(args.rotation === undefined || args.rotation === "facing" || [0,90,180,270].includes(Number(args.rotation)) ? [] : ["Invalid rotation"])]; },
      assess: args => { const result = validateBlueprint(args.blueprint); return { risk: riskForBlocks(result.estimatedBlocks), estimatedBlocks: result.estimatedBlocks, summary: `Build ${(args.blueprint as Blueprint)?.name ?? "blueprint"} (${result.estimatedBlocks} writes)`, worldChanging: true }; },
      execute: (context, args) => { const typed = args as unknown as BuildToolArguments; const selected = buildOrigin(context.player, typed); context.engine.start(context.player, typed.blueprint, selected); return ok("build_blueprint", `${typed.blueprint.name} build started`, selected); }
    },
    {
      name: "undo", description: "Restore the most recent world-changing action from the bounded snapshot history.", inputSchema: objectSchema({}), validate: () => [],
      assess: () => ({ risk: "MEDIUM", estimatedBlocks: 0, summary: "Undo the last world action", worldChanging: true }), execute: ({ player, engine }) => ok("undo", engine.undo(player) ? "Last action restored" : "No undo snapshot was available")
    },
    {
      name: "save_waypoint", description: "Save the current or crosshair location in world-local memory.", inputSchema: objectSchema({ name: { type: "string", minLength: 1, maxLength: 40 }, target: targetSchema }, ["name", "target"]),
      validate: args => [...stringError(args.name, "name", 40), ...targetError(args.target)], assess: args => ({ risk: "LOW", estimatedBlocks: 0, summary: `Save waypoint ${String(args.name)}`, worldChanging: false }),
      execute: ({ player }, args) => { const coordinates = args.target === "crosshair" ? targetPosition(player, "crosshair") : floorLocation(player); const waypoint = saveWaypoint({ name: String(args.name), dimensionId: player.dimension.id, coordinates, type: "place" }); return ok("save_waypoint", `Saved waypoint ${waypoint.name}`, { waypoint }); }
    },
    {
      name: "list_waypoints", description: "List waypoints stored in this world.", inputSchema: objectSchema({}), validate: () => [], assess: () => ({ risk: "LOW", estimatedBlocks: 0, summary: "List waypoints", worldChanging: false }),
      execute: () => ok("list_waypoints", `${listWaypoints().length} waypoint(s)`, { waypoints: listWaypoints() })
    },
    {
      name: "navigate_to_waypoint", description: "Guide the player using the native Locator Bar and throttled action-bar direction/distance.", inputSchema: objectSchema({ name: { type: "string", minLength: 1, maxLength: 40 } }, ["name"]),
      validate: args => stringError(args.name, "name", 40), assess: args => ({ risk: "LOW", estimatedBlocks: 0, summary: `Guide to ${String(args.name)}`, worldChanging: false }),
      execute: ({ player, navigation }, args) => { const waypoint = findWaypoint(String(args.name)); if (!waypoint) return { ok: false, tool: "navigate_to_waypoint", message: `Waypoint not found: ${String(args.name)}` }; navigation.start(player, waypoint); return ok("navigate_to_waypoint", `Guiding to ${waypoint.name}`, { waypoint }); }
    },
    {
      name: "stop_navigation", description: "Stop the player's active waypoint guide.", inputSchema: objectSchema({}), validate: () => [], assess: () => ({ risk: "LOW", estimatedBlocks: 0, summary: "Stop navigation", worldChanging: false }),
      execute: ({ player, navigation }) => { navigation.stop(player); return ok("stop_navigation", "Navigation stopped"); }
    },
    {
      name: "find_biome", description: "Find a stable biome type from the world seed. This is seed-derived and does not inspect modified terrain.", inputSchema: objectSchema({ biome: { type: "string", pattern: "^minecraft:[a-z0-9_]+$" }, guide: { type: "boolean" }, saveAs: { type: "string", maxLength: 40 } }, ["biome"]),
      validate: args => typeof args.biome === "string" && BiomeTypes.get(args.biome) ? [] : [`Unknown biome identifier: ${String(args.biome)}`], assess: args => ({ risk: "MEDIUM", estimatedBlocks: 0, summary: `Search for ${String(args.biome)} (one bounded seed query)`, worldChanging: false }),
      execute: ({ player, navigation }, args) => { const found = player.dimension.calculateClosestBiomeFromSeed(player.location, String(args.biome), { boundingSize: { x: 4096, y: 384, z: 4096 } }); if (!found) return { ok: false, tool: "find_biome", message: `No ${String(args.biome)} found inside the bounded search` }; const coordinates: Vec3Tuple = [Math.floor(found.x), Math.floor(found.y), Math.floor(found.z)]; const distance = Math.round(Math.hypot(found.x - player.location.x, found.z - player.location.z)); let waypoint; if (args.saveAs || args.guide) waypoint = saveWaypoint({ name: String(args.saveAs ?? String(args.biome).replace("minecraft:", "")), dimensionId: player.dimension.id, coordinates, type: "biome" }); if (args.guide && waypoint) navigation.start(player, waypoint); return ok("find_biome", `Found ${String(args.biome)} about ${distance} blocks away`, { coordinates, distance, seedDerived: true }); }
    },
    {
      name: "cancel_current_action", description: "Cancel the current queued build or edit. Undo remains available.", inputSchema: objectSchema({}), validate: () => [], assess: () => ({ risk: "LOW", estimatedBlocks: 0, summary: "Cancel current action", worldChanging: false }),
      execute: ({ player, engine }) => ok("cancel_current_action", engine.cancel(player) ? "Current action cancelled" : "No action was running")
    },
    {
      name: "get_current_action", description: "Read build/edit progress without changing the world.", inputSchema: objectSchema({}), validate: () => [], assess: () => ({ risk: "LOW", estimatedBlocks: 0, summary: "Read current action", worldChanging: false }),
      execute: ({ engine }) => ok("get_current_action", engine.statusText(), { busy: engine.isBusy })
    }
  ];
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  constructor(definitions = createToolDefinitions()) { for (const definition of definitions) this.tools.set(definition.name, definition); }
  list(): ToolDefinition[] { return [...this.tools.values()]; }
  get(name: string): ToolDefinition | undefined { return this.tools.get(name); }
}
