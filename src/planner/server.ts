import { secrets, variables } from "@minecraft/server-admin";
import { HttpHeader, HttpRequest, HttpRequestMethod, http } from "@minecraft/server-net";
import type { Blueprint } from "../blueprint/types.js";
import type { Planner } from "./types.js";
import type { AgentResponse, AgentWorldContext, AssistantPlanner } from "../agent/types.js";

function endpoint(): string | undefined {
  const value = variables.get("AIBUILDER_ENDPOINT");
  return typeof value === "string" && /^https:\/\//.test(value) ? value : undefined;
}

export const serverPlanner: Planner = {
  get available() { return endpoint() !== undefined && secrets.get("AIBUILDER_TOKEN") !== undefined; },
  get unavailableReason() { return "Dedicated Server variables AIBUILDER_ENDPOINT and secret AIBUILDER_TOKEN must be configured."; },
  async generate(prompt, context): Promise<Blueprint> {
    const uri = endpoint();
    const token = secrets.get("AIBUILDER_TOKEN");
    if (!uri || !token) throw new Error(this.unavailableReason);
    const request = new HttpRequest(uri);
    request.method = HttpRequestMethod.Post;
    request.timeout = 25;
    request.body = JSON.stringify({ prompt, locale: context.locale, limits: { maxBlocks: context.maxBlocks, maxSize: context.maxSize } });
    request.headers = [new HttpHeader("Content-Type", "application/json"), new HttpHeader("Authorization", token)];
    const response = await http.request(request);
    if (response.status < 200 || response.status >= 300) throw new Error(`AI backend returned HTTP ${response.status}`);
    let parsed: { blueprint?: Blueprint; error?: string };
    try { parsed = JSON.parse(response.body) as typeof parsed; } catch { throw new Error("AI backend returned invalid JSON"); }
    if (!parsed.blueprint) throw new Error(parsed.error ?? "AI backend did not return a blueprint");
    return parsed.blueprint;
  }
};

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const uri = endpoint();
  const token = secrets.get("AIBUILDER_TOKEN");
  if (!uri || !token) throw new Error("Dedicated Server variables AIBUILDER_ENDPOINT and secret AIBUILDER_TOKEN must be configured.");
  const request = new HttpRequest(uri);
  request.method = HttpRequestMethod.Post;
  request.timeout = 25;
  request.body = JSON.stringify(body);
  request.headers = [new HttpHeader("Content-Type", "application/json"), new HttpHeader("Authorization", token)];
  const response = await http.request(request);
  if (response.status < 200 || response.status >= 300) throw new Error(`AI backend returned HTTP ${response.status}`);
  try { return JSON.parse(response.body) as Record<string, unknown>; } catch { throw new Error("AI backend returned invalid JSON"); }
}

export const serverAssistantPlanner: AssistantPlanner = {
  get available() { return endpoint() !== undefined && secrets.get("AIBUILDER_TOKEN") !== undefined; },
  get unavailableReason() { return "Dedicated Server variables AIBUILDER_ENDPOINT and secret AIBUILDER_TOKEN must be configured."; },
  async plan(prompt: string, context: AgentWorldContext): Promise<AgentResponse> {
    const parsed = await post({ mode: "assistant", prompt, locale: context.locale, context, limits: context.limits });
    if (!parsed.response) throw new Error(typeof parsed.error === "string" ? parsed.error : "AI backend did not return an agent response");
    return parsed.response as AgentResponse;
  }
};

export const serverImageBridge: import("../image/ui.js").ImageBridge = {
 async create(dimension){return await post({mode:"image_session",dimension}) as unknown as {session:string;url:string};},
 async fetch(session){const result=await post({mode:"image_fetch",session});return result.plan as import("../image/build-plan.js").BuildPlan|undefined;}
};
