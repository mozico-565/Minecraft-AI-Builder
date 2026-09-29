import blueprintSchema from "../schemas/blueprint.schema.json" with { type: "json" };

type Schema = Record<string, unknown>;
const object = (properties: Schema, required: string[] = []): Schema => ({ type: "object", additionalProperties: false, properties, required });
const block = { type: "string", pattern: "^minecraft:[a-z0-9_]+$" };
const target = { type: "string", enum: ["player", "crosshair"] };
const size = object({ x: { type: "integer", minimum: 1, maximum: 128 }, y: { type: "integer", minimum: 1, maximum: 64 }, z: { type: "integer", minimum: 1, maximum: 128 } }, ["x", "y", "z"]);

function rewriteBlueprintRefs(value: unknown): void {
  if (Array.isArray(value)) value.forEach(rewriteBlueprintRefs);
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Schema)) {
      if (key === "$ref" && typeof child === "string") (value as Schema)[key] = child.replace("#/$defs/", "#/$defs/blueprint/");
      else rewriteBlueprintRefs(child);
    }
  }
}

function cloneBlueprintSchema(): Schema {
  const clone = structuredClone(blueprintSchema) as Schema;
  delete clone.$schema;
  delete clone.$id;
  delete clone.$defs;
  rewriteBlueprintRefs(clone);
  return clone;
}

const call = (tool: string, args: Schema): Schema => object({ tool: { const: tool }, arguments: args }, ["tool", "arguments"]);

export const AGENT_RESPONSE_SCHEMA: Schema = object({
  message: { type: "string", minLength: 1, maxLength: 500 },
  toolCalls: {
    type: "array", maxItems: 8,
    items: { oneOf: [
      call("get_player_position", object({})),
      call("get_target_block", object({ maxDistance: { type: "integer", minimum: 1, maximum: 32 } })),
      call("place_block", object({ block, target, mode: { type: "string", enum: ["replace", "adjacent"] } }, ["block", "target"])),
      call("place_feature", object({ feature: { const: "tree" }, target }, ["feature", "target"])),
      call("fill_region", object({ target, size, block }, ["target", "size", "block"])),
      call("replace_region", object({ target, size, sourceBlocks: { type: "array", minItems: 1, maxItems: 8, items: block }, block }, ["target", "size", "sourceBlocks", "block"])),
      call("build_blueprint", object({ blueprint: cloneBlueprintSchema(), placement: { enum: ["here", "front", "crosshair"] }, rotation: { enum: [0, 90, 180, 270, "facing"] } }, ["blueprint"])),
      call("undo", object({})),
      call("save_waypoint", object({ name: { type: "string", minLength: 1, maxLength: 40 }, target }, ["name", "target"])),
      call("list_waypoints", object({})),
      call("navigate_to_waypoint", object({ name: { type: "string", minLength: 1, maxLength: 40 } }, ["name"])),
      call("stop_navigation", object({})),
      call("find_biome", object({ biome: { type: "string", pattern: "^minecraft:[a-z0-9_]+$" }, guide: { type: "boolean" }, saveAs: { type: "string", maxLength: 40 } }, ["biome"])),
      call("cancel_current_action", object({})),
      call("get_current_action", object({}))
    ] }
  }
}, ["message", "toolCalls"]);

const blueprintDefs = structuredClone((blueprintSchema as Schema).$defs);
rewriteBlueprintRefs(blueprintDefs);
AGENT_RESPONSE_SCHEMA.$defs = { blueprint: blueprintDefs };
