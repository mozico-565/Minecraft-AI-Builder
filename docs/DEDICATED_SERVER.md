# Dedicated Server AI setup

The AI-enabled pack must run on Bedrock Dedicated Server. `@minecraft/server-net` cannot run in local Android/Windows worlds or Realms.

## Requirements

- Bedrock Dedicated Server 26.40.
- A world with Beta APIs enabled. Only the server networking/admin modules need the experiment; the builder uses stable APIs.
- `Minecraft-AI-Builder-Server.mcpack` activated in the server world.
- A deployed HTTPS Worker.

## BDS configuration

Run the server once so `config/default` is created. Add `@minecraft/server-net` to `permissions.json`, then create `variables.json` and `secrets.json` exactly as shown in the README.

Use a long random value (at least 32 bytes) for `AIBUILDER_TOKEN`. It must equal the Worker's `BUILDER_SHARED_SECRET`. The AI provider key belongs only in the Worker's `AI_API_KEY` secret and must never be placed in BDS or the pack.

## Provider configuration

The Worker supports OpenAI-compatible `/chat/completions` APIs. Configure:

- `AI_BASE_URL`: provider API root without `/chat/completions`.
- `AI_MODEL`: a JSON-capable chat model.
- `AI_STRUCTURED_OUTPUT`: `json_object` for broad compatibility, or `json_schema` when supported.

Groq is the default example because it has had a useful free tier, but model availability and free limits change. The provider adapter is isolated in `backend/worker.ts` so another OpenAI-compatible service can be selected without modifying the Add-On.

## Request flow

1. Player submits Arabic or English text in the in-game form.
2. BDS passes it over HTTPS with the protected shared token.
3. Worker sends the planner system prompt and JSON Schema to the provider.
4. Worker returns a structured Agent Response containing only registered tool calls. Build requests contain Blueprint JSON as the argument to `build_blueprint`.
5. The Add-On validates the response, tool name, arguments, block IDs, coordinates, limits, and Blueprint before execution.
6. LOW actions can execute directly, MEDIUM actions show a summary, and HIGH actions require preview plus explicit confirmation.
7. World-changing tools share one snapshot/action-history layer and one tick-batched engine.

## Troubleshooting

- **AI unavailable:** confirm both config keys exist and restart BDS.
- **401:** BDS and Worker shared secrets differ.
- **403/module denied:** add `@minecraft/server-net` and `@minecraft/server-admin` to permissions and enable Beta APIs.
- **Provider 400:** use `AI_STRUCTURED_OUTPUT = "json_object"` or select a model that supports JSON Schema.
- **Unloaded chunks:** move the player closer to the preview area and retry.
- **Blueprint rejected:** the provider used an unsupported block/operation or exceeded a limit; the world is not modified.
