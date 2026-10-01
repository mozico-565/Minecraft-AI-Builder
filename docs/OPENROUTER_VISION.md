# OpenRouter Vision — preserved Image-to-Build integration

Continues from `5abd071`; no Builder, Task Manager, Companion layout or image architecture was replaced.

## Verified model, 2026-09-30

The official [live model catalog](https://openrouter.ai/api/v1/models) lists `minimax/minimax-m3` with `text`, `image`, `video` inputs, `text` output, and `response_format` / `structured_outputs` support. This is the configurable default. No M3 `:free` variant was found in that catalog; do not invent one. This default may require paid OpenRouter credit. Model availability and endpoint support can change.

The adapter sends reference JPEG data URLs and the user's original Arabic/English instructions together to `https://openrouter.ai/api/v1/chat/completions`. Explicit requested dimensions/materials take precedence over inferred reference appearance in the system prompt. A model can still fail to satisfy these; visual/semantic acceptance requires real generation and review. No natural-language keyword replacement is used.

Default response format is JSON Schema for `{blueprint, assumptions, open_choices}`. Its Blueprint `$defs` are hoisted to the envelope root so relative schema refs remain valid. `provider.require_parameters=true` requires compatible parameters, while `OPENROUTER_PROVIDER=Together` pins the endpoint actually verified for strict output. Generic `response_format` support alone does not prove full schema enforcement; no silent fallback to a text-only model or fixture exists. Strict schema subsets vary between endpoints. If a real endpoint rejects the existing recursive Blueprint schema, set the **server variable** `OPENROUTER_OUTPUT_FORMAT=json_object`; full local Blueprint/BuildPlan schema and semantic validation still remain mandatory. This is an explicit operator choice, not a success claim or automatic retry.

See official [structured output/routing documentation](https://openrouter.ai/docs/guides/features/structured-outputs).

## Safe deployment from a phone

Deploy the updated `dist/backend/worker.mjs` using the existing Worker configuration, SQLite ImageSession migration and BDS configuration. In Cloudflare dashboard:

1. **Workers & Pages → your Minecraft Worker → Settings → Variables and Secrets → Add**.
2. Set name **OPENROUTER_API_KEY**, type **Secret**, value your OpenRouter key. Save/deploy. Never add it as a plain variable, GitHub file, browser form field or Behavior Pack value.
3. Set plain server variables `VISION_PROVIDER=openrouter`, `OPENROUTER_MODEL=minimax/minimax-m3`, `OPENROUTER_OUTPUT_FORMAT=json_schema`, `OPENROUTER_PROVIDER=Together`. Keep existing Production Secrets; do not re-enter them when already configured.
4. Keep existing `BUILDER_SHARED_SECRET` and BDS secret configuration. The existing text assistant still uses its separately configured compatible provider; OpenRouter is added for Vision only.
5. Android joins BDS, opens the existing private Companion session link, uploads actual photos and enters e.g. `ابنِ هذا بعرض 40 بلوك والسقف أسود`. Fetch the resulting plan in-game, validate placement, preview and confirm.

CLI equivalent (interactive secret entry; never inline a key):

```bash
cp backend/wrangler.toml.example backend/wrangler.toml
npx wrangler secret put OPENROUTER_API_KEY --config backend/wrangler.toml
npx wrangler deploy --config backend/wrangler.toml
```

Cloudflare deploy authentication and existing shared-secret configuration are still required. Do not remove existing secrets when updating a Worker.

## Local real provider test

Copy `backend/.dev.vars.example` to root `.dev.vars` (gitignored). Fill `OPENROUTER_API_KEY` locally; keep `VISION_PROVIDER=openrouter`. On Node 22+:

```bash
node --env-file=.dev.vars --import tsx tools/vision-smoke.ts normalized-real-photo.jpg
```

Use a real normalized JPEG, max1536px; up to three image paths allowed. Set `AIBUILDER_SMOKE_PROMPT` in the local env file to your desired instructions. This calls the real provider and writes validated `.local/vision-smoke/BuildPlan.json` only on success. No request headers, API key, upstream error body or raw provider reply are logged. It does not execute Bedrock. For the existing real HTTP/session workflow locally:

```bash
node --env-file=.dev.vars --import tsx tools/serve-companion.ts
```

The printed private URL is localhost QA; supported Android usage remains the deployed HTTPS Worker + BDS. The key never goes to the Companion HTML/JS. Upload bodies contain images/instructions only.

## Actual result in this workspace

The existing `minecraft-ai-backend` Worker is deployed at <https://minecraft-ai-backend.mohamedturiq18.workers.dev>. Its real production image endpoint generated an unedited MiniMax M3 BuildPlan via Together: **40 × 6 × 8**, **24 operations**, **1,270 writes**, flat `minecraft:black_concrete` roof. Original schema/semantic validation, native ImageSession storage, and authenticated plan fetch passed. [Actual generated plan](../examples/vision/openrouter-m3-villa.buildplan.json), [provenance](../examples/vision/provenance.json), and [runtime QA](CLOUDFLARE_LIVE_QA.md).

Real upstream tests showed that generic JSON mode/advertised response-format support did not consistently enforce the schema. CoreWeave's grammar rejected `propertyNames` and `oneOf`, then was temporarily rate-limited; Together accepted the compatible strict schema. The provider-only grammar omits `propertyNames` and uses `anyOf` for the existing disjoint variants. Every returned blueprint still passes the complete original schemas and limits; there is no repaired, edited, or fabricated output promoted to a valid plan. No API key reaches the Companion or either package. Server errors expose fixed codes and bounded status/limit numbers, never upstream error text.

Nine affected/new tests passed, including four new grammar/routing/error-boundary tests. TypeScript, schemas/manifests and packaging passed. The previous 49-test baseline was preserved without re-running unrelated completed Builder tests. Physical Android/BDS gameplay, placement/preview/build and restart/Undo in a real world remain outstanding; no Minecraft execution is claimed from the successful backend result.
