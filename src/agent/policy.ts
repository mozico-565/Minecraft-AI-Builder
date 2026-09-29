import type { AgentResponse, AgentToolCall, RiskLevel, ToolAssessment } from "./types.js";

export const MAX_AGENT_STEPS = 8;
export const MAX_ACTION_BLOCKS = 25_000;
export const MAX_RAY_DISTANCE = 32;

export const TOOL_NAMES = [
  "get_player_position", "get_target_block", "place_block", "place_feature", "fill_region",
  "replace_region", "build_blueprint", "undo", "save_waypoint", "list_waypoints",
  "navigate_to_waypoint", "stop_navigation", "find_biome", "cancel_current_action", "get_current_action"
] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isVec3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(item => Number.isInteger(item));
}

export function regionVolume(value: unknown): number {
  if (!isRecord(value)) return 0;
  const values = [value.x, value.y, value.z];
  if (!values.every(item => Number.isInteger(item) && Number(item) > 0)) return 0;
  return Number(value.x) * Number(value.y) * Number(value.z);
}

export function riskForBlocks(blocks: number): RiskLevel {
  if (blocks <= 64) return "LOW";
  if (blocks <= 4_096) return "MEDIUM";
  return "HIGH";
}

export function combineAssessments(assessments: ToolAssessment[]): ToolAssessment {
  const order: RiskLevel[] = ["LOW", "MEDIUM", "HIGH"];
  const estimatedBlocks = assessments.reduce((sum, item) => sum + item.estimatedBlocks, 0);
  const risk = assessments.reduce<RiskLevel>((highest, item) => order.indexOf(item.risk) > order.indexOf(highest) ? item.risk : highest, "LOW");
  return { risk, estimatedBlocks, summary: assessments.map(item => item.summary).join("\n"), worldChanging: assessments.some(item => item.worldChanging) };
}

export function validateAgentResponse(value: unknown): { ok: boolean; errors: string[]; response?: AgentResponse } {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["Agent response must be an object"] };
  if (typeof value.message !== "string" || value.message.trim().length === 0 || value.message.length > 500) errors.push("message must be 1-500 characters");
  if (!Array.isArray(value.toolCalls)) errors.push("toolCalls must be an array");
  else {
    if (value.toolCalls.length > MAX_AGENT_STEPS) errors.push(`toolCalls exceeds the ${MAX_AGENT_STEPS} step limit`);
    value.toolCalls.forEach((raw, index) => {
      if (!isRecord(raw) || typeof raw.tool !== "string" || !isRecord(raw.arguments)) errors.push(`toolCalls[${index}] is invalid`);
      else if (!(TOOL_NAMES as readonly string[]).includes(raw.tool)) errors.push(`Unknown tool: ${raw.tool}`);
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors, response: value as unknown as AgentResponse };
}

export function callsChangingWorld(calls: AgentToolCall[]): number {
  const changing = new Set(["place_block", "place_feature", "fill_region", "replace_region", "build_blueprint", "undo"]);
  return calls.filter(call => changing.has(call.tool)).length;
}

export function offlineToolCall(prompt: string): AgentResponse | undefined {
  const text = prompt.trim();
  const normalized = text.toLocaleLowerCase();
  if (["undo", "تراجع", "رجع آخر حاجة", "امسح آخر شيء عملته"].includes(normalized)) return { message: "Undo last action", toolCalls: [{ tool: "undo", arguments: {} }] };
  if (["cancel", "stop", "إلغاء", "وقف", "الغِ"].includes(normalized)) return { message: "Cancel current action", toolCalls: [{ tool: "cancel_current_action", arguments: {} }] };
  if (["status", "الحالة", "وين وصل", "ما الحالة"].includes(normalized)) return { message: "Current action status", toolCalls: [{ tool: "get_current_action", arguments: {} }] };
  const navigationPatterns = [/^وين\s+(.+)$/u, /^خذني إلى\s+(.+)$/u, /^اذهب إلى\s+(.+)$/u, /^navigate(?: to)?\s+(.+)$/iu];
  for (const pattern of navigationPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const name = match[1].trim().replace(/[؟?!.,،]+$/u, "").trim();
      if (name) return { message: `Navigate to ${name}`, toolCalls: [{ tool: "navigate_to_waypoint", arguments: { name } }] };
    }
  }
  return undefined;
}
