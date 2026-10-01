import { readBoundedBody } from "./request-limit.js";
import { COMPANION_HTML } from "./companion.js";
import { reply, type SessionBinding } from "./image-session.js";
export { ImageSession } from "./image-session.js";
import blueprintSchema from "../schemas/blueprint.schema.json" with { type: "json" };
import { PLANNER_SYSTEM_PROMPT } from "./system-prompt.js";
import { ASSISTANT_SYSTEM_PROMPT } from "./assistant-prompt.js";
import { AGENT_RESPONSE_SCHEMA } from "./agent-schema.js";
import {
  MINECRAFT_WS_HEALTH_PATH,
  MINECRAFT_WS_PATH,
  minecraftWebSocketHealth,
  upgradeMinecraftWebSocket
} from "./minecraft-ws.js";

interface Env {
  VISION_PROVIDER?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_OUTPUT_FORMAT?: string;
  OPENROUTER_PROVIDER?: string;
  AI_API_KEY: string;
  AI_VISION_MODEL?: string;
  AI_VISION_REASONING_EFFORT?: string;
  AI_VISION_REASONING_FORMAT?: string;
  IMAGE_SESSIONS?: SessionBinding;
  BUILDER_SHARED_SECRET: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  AI_STRUCTURED_OUTPUT?: string;
}

interface RequestBody {
  mode?: unknown;
  session?: string;
  dimension?: string;
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
    signal: AbortSignal.timeout(45000),
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
    throw new Error(`AI provider returned HTTP ${response.status}`);
  }
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI provider returned no content");
  try { return JSON.parse(content); } catch { throw new Error("AI provider returned non-JSON content"); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === MINECRAFT_WS_HEALTH_PATH && request.method === "GET") return minecraftWebSocketHealth();
    if (url.pathname === MINECRAFT_WS_PATH) return upgradeMinecraftWebSocket(request);
    if (request.method === "GET" && url.pathname === "/companion") return new Response(COMPANION_HTML, {headers:{"content-type":"text/html;charset=utf-8","cache-control":"no-store","referrer-policy":"no-referrer","content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src blob: data:; base-uri 'none'; frame-ancestors 'none'"}});
    const match = /^\/image\/session\/([a-f0-9]{32})$/.exec(url.pathname);
    if (match && request.method === "POST") {
      if (!env.IMAGE_SESSIONS) return reply({error:"Image sessions not configured"},503);
      if (request.headers.get("origin") !== url.origin) return reply({error:"Origin rejected"},403);
      let text:string;try{text=await readBoundedBody(request,4600000);}catch{return reply({error:"Image request too large or invalid encoding"},413);}
      return env.IMAGE_SESSIONS.get(env.IMAGE_SESSIONS.idFromName(match[1]!)).fetch(new Request("https://session/generate",{method:"POST",body:text}));
    }
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    if (!env.BUILDER_SHARED_SECRET || bearer(request) !== env.BUILDER_SHARED_SECRET) return json({ error: "Unauthorized" }, 401);

    let body: RequestBody;
    try { const text = await readBoundedBody(request,300000); body = JSON.parse(text) as RequestBody; } catch { return json({ error: "Invalid JSON body" }, 400); }
    if(!body || typeof body!=="object" || Array.isArray(body)) return json({error:"Request body must be an object"},400);
    if (body.mode === "image_session" || body.mode === "image_fetch") {
      if (!env.IMAGE_SESSIONS) return reply({error:"Image sessions not configured"},503);
      if (body.mode === "image_session") {
        if(body.dimension!==undefined && !["minecraft:overworld","minecraft:nether","minecraft:the_end"].includes(body.dimension))return reply({error:"Invalid dimension"},400);
        const id=crypto.randomUUID().replace(/-/g,"");
        const initialized = await env.IMAGE_SESSIONS.get(env.IMAGE_SESSIONS.idFromName(id)).fetch(new Request("https://session/init",{method:"POST",body:JSON.stringify({dimension:body.dimension??"minecraft:overworld"})}));
        if(!initialized.ok)return reply({error:"Unable to initialize image session"},503);
        return reply({session:id,url:url.origin+"/companion#"+id});
      }
      if (!/^[a-f0-9]{32}$/.test(body.session??"")) return reply({error:"Invalid session"},400);
      return env.IMAGE_SESSIONS.get(env.IMAGE_SESSIONS.idFromName(body.session!)).fetch(new Request("https://session/plan"));
    }
    if (!env.AI_API_KEY) return json({ error: "AI provider is not configured" }, 503);
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
