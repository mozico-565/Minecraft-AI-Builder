import type { Player } from "@minecraft/server";
import type { Blueprint, Vec3Tuple } from "../blueprint/types.js";
import type { BuildingEngine } from "../builder/engine.js";
import type { NavigationService } from "../navigation/service.js";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface AgentToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface AgentResponse {
  message: string;
  toolCalls: AgentToolCall[];
}

export interface AgentWorldContext {
  locale: "ar" | "en";
  player: { dimensionId: string; position: Vec3Tuple; direction: { x: number; y: number; z: number } };
  targetBlock?: { position: Vec3Tuple; typeId: string; face: string };
  waypoints: Array<{ name: string; dimensionId: string; coordinates: Vec3Tuple }>;
  currentAction: string;
  limits: { maxAgentSteps: number; maxBlocks: number; maxRayDistance: number };
}

export interface ToolResult {
  ok: boolean;
  tool: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface ToolAssessment {
  risk: RiskLevel;
  estimatedBlocks: number;
  summary: string;
  worldChanging: boolean;
}

export interface ToolExecutionContext {
  player: Player;
  engine: BuildingEngine;
  navigation: NavigationService;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  validate(argumentsValue: Record<string, unknown>): string[];
  assess(argumentsValue: Record<string, unknown>): ToolAssessment;
  execute(context: ToolExecutionContext, argumentsValue: Record<string, unknown>): Promise<ToolResult> | ToolResult;
}

export interface AssistantPlanner {
  readonly available: boolean;
  readonly unavailableReason?: string;
  plan(prompt: string, context: AgentWorldContext): Promise<AgentResponse>;
}

export interface BuildToolArguments {
  blueprint: Blueprint;
  placement?: "here" | "front" | "crosshair";
  rotation?: 0 | 90 | 180 | 270 | "facing";
}
