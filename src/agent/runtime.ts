import type { Player } from "@minecraft/server";
import type { Vec3Tuple } from "../blueprint/types.js";
import type { BuildingEngine } from "../builder/engine.js";
import { listWaypoints } from "../memory/world-memory.js";
import type { NavigationService } from "../navigation/service.js";
import { callsChangingWorld, combineAssessments, MAX_ACTION_BLOCKS, MAX_AGENT_STEPS, MAX_RAY_DISTANCE, validateAgentResponse } from "./policy.js";
import type { AgentResponse, AgentToolCall, AgentWorldContext, ToolAssessment, ToolResult } from "./types.js";
import { ToolRegistry } from "./registry.js";

function floorTuple(value: { x: number; y: number; z: number }): Vec3Tuple { return [Math.floor(value.x), Math.floor(value.y), Math.floor(value.z)]; }

export interface PreparedAgentAction {
  response: AgentResponse;
  assessments: ToolAssessment[];
  combined: ToolAssessment;
}

export class AgentRuntime {
  constructor(readonly registry: ToolRegistry, readonly engine: BuildingEngine, readonly navigation: NavigationService) {}

  captureContext(player: Player, locale: "ar" | "en"): AgentWorldContext {
    const hit = player.getBlockFromViewDirection({ maxDistance: 16, includeLiquidBlocks: true, includePassableBlocks: true });
    return {
      locale,
      player: { dimensionId: player.dimension.id, position: floorTuple(player.location), direction: player.getViewDirection() },
      targetBlock: hit ? { position: floorTuple(hit.block.location), typeId: hit.block.typeId, face: hit.face } : undefined,
      waypoints: listWaypoints().map(({ name, dimensionId, coordinates }) => ({ name, dimensionId, coordinates })),
      currentAction: this.engine.statusText(),
      limits: { maxAgentSteps: MAX_AGENT_STEPS, maxBlocks: MAX_ACTION_BLOCKS, maxRayDistance: MAX_RAY_DISTANCE }
    };
  }

  prepare(value: unknown): PreparedAgentAction {
    const parsed = validateAgentResponse(value);
    if (!parsed.ok || !parsed.response) throw new Error(parsed.errors.join("; "));
    if (callsChangingWorld(parsed.response.toolCalls) > 1) throw new Error("Version 0.1 permits at most one world-changing tool call per request");
    const assessments = parsed.response.toolCalls.map(call => {
      const definition = this.registry.get(call.tool);
      if (!definition) throw new Error(`Unknown tool: ${call.tool}`);
      const errors = definition.validate(call.arguments);
      if (errors.length) throw new Error(`${call.tool}: ${errors.join("; ")}`);
      return definition.assess(call.arguments);
    });
    const combined = combineAssessments(assessments);
    if (combined.estimatedBlocks > MAX_ACTION_BLOCKS) throw new Error(`Plan exceeds the ${MAX_ACTION_BLOCKS} block mobile limit`);
    return { response: parsed.response, assessments, combined };
  }

  async execute(player: Player, prepared: PreparedAgentAction): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const call of prepared.response.toolCalls) {
      const definition = this.registry.get(call.tool);
      if (!definition) throw new Error(`Unknown tool: ${call.tool}`);
      try {
        const result = await definition.execute({ player, engine: this.engine, navigation: this.navigation }, call.arguments);
        results.push(result);
        if (!result.ok) break;
      } catch (error) {
        results.push({ ok: false, tool: call.tool, message: error instanceof Error ? error.message : String(error) });
        break;
      }
    }
    return results;
  }
}
