import blueprintSchema from "../schemas/blueprint.schema.json" with { type: "json" };
import { PLANNER_SYSTEM_PROMPT } from "./system-prompt.js";
import { ASSISTANT_SYSTEM_PROMPT } from "./assistant-prompt.js";
import { AGENT_RESPONSE_SCHEMA } from "./agent-schema.js";

interface Env {
  AI_API_KEY: string;
  BUILDER_SHARED_SECRET: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  AI_STRUCTURED_OUTPUT?: string;
}

interface RequestBody {
  mode?: unknown;
  prompt?: unknown;
  locale?: unknown;
  limits?: { maxBlocks?: unknown; maxSize?: unknown };
  context?: unknown;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function bearer(request: Request): string {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : value;
}

async function providerRequest(env: Env, body: RequestBody): Promise<unknown> {
  const base = (env.AI_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const model = env.AI_MODEL ?? "llama-3.3-70b-versatile";
  const limitText = JSON.stringify({ maxBlocks: body.limits?.maxBlocks ?? 25000, maxSize: body.limits?.maxSize ?? { x: 128, y: 128, z: 128 } });
  const structured = env.AI_STRUCTURED_OUTPUT === "json_schema";
  const assistant = body.mode === "assistant";
  const schema = assistant ? AGENT_RESPONSE_SCHEMA : blueprintSchema;
  const responseFormat = structured
    ? { type: "json_schema", json_schema: { name: assistant ? "minecraft_agent_response" : "minecraft_blueprint", strict: true, schema } }
    : { type: "json_object" };
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.AI_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 6000,
      response_format: responseFormat,
      messages: [
        { role: "system", content: assistant ? ASSISTANT_SYSTEM_PROMPT : PLANNER_SYSTEM_PROMPT },
        { role: "user", content: assistant
          ? `Locale: ${body.locale === "en" ? "English" : "Arabic"}\nWorld context: ${JSON.stringify(body.context ?? {})}\nHard limits: ${limitText}\nUser request: ${String(body.prompt)}`
          : `Locale: ${body.locale === "en" ? "English" : "Arabic"}\nHard limits: ${limitText}\nBuild request: ${String(body.prompt)}` }
      ]
    })
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`AI provider ${response.status}: ${detail}`);
  }
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI provider returned no content");
  try { return JSON.parse(content); } catch { throw new Error("AI provider returned non-JSON content"); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    if (!env.BUILDER_SHARED_SECRET || bearer(request) !== env.BUILDER_SHARED_SECRET) return json({ error: "Unauthorized" }, 401);
    if (!env.AI_API_KEY) return json({ error: "AI provider is not configured" }, 503);
    let body: RequestBody;
    try { body = await request.json() as RequestBody; } catch { return json({ error: "Invalid JSON body" }, 400); }
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length < 3 || prompt.length > 1200) return json({ error: "Prompt must be 3-1200 characters" }, 400);
    try {
      const result = await providerRequest(env, { ...body, prompt });
      return body.mode === "assistant" ? json({ response: result }) : json({ blueprint: result });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Planner failed" }, 502);
    }
  }
};
