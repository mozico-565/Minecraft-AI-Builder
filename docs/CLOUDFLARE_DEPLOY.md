# Deploy the existing Worker (no new backend)

The existing backend is a Cloudflare ES module Worker: default `fetch(request, env)` handler and exported `ImageSession` Durable Object class. The production Secret reaches `env.OPENROUTER_API_KEY` in the Worker and Durable Object constructor, then the existing OpenRouterVisionProvider. No Adapter, `nodejs_compat`, Pages adapter, KV or R2 is required. Deployment, the published Companion endpoint, and production Durable Object session creation were verified on September 30, 2026. See [the actual runtime results](CLOUDFLARE_LIVE_QA.md); real production Vision, validation, session storage and authenticated fetch pass; Minecraft/phone E2E remains outstanding.

## Existing/ready files

- `backend/wrangler.toml.example`: source template, `main = "../dist/backend/worker.mjs"`.
- `backend/wrangler.toml`: local generated config (gitignored), same source-relative entry.
- `dist/backend/worker.mjs`: current bundled Worker, with Companion HTML and endpoints included.
- `dist/backend/wrangler.toml`: ready packaged deployment config, `main = "./worker.mjs"`.
- `dist/backend/wrangler.toml.example`: same packaged template. Previously its copied main path resolved incorrectly to `dist/dist`; corrected without changing application logic.

Existing Worker name: **minecraft-ai-backend**. The verified deployment URL is **https://minecraft-ai-backend.mohamedturiq18.workers.dev**. Do not deploy to a new name or add `--env production`: no named production environment is defined, and the top-level config targets the existing production Worker.

`keep_vars = true` preserves dashboard-managed variables. Wrangler normally preserves existing Secrets; these configs include no secret values. Do not delete/re-add OPENROUTER_API_KEY, and do not supply it in CLI arguments, GitHub or build logs.

## Exact command from repository root

On a computer/terminal with Node/npm and access to your Cloudflare account:

```bash
npm ci
npm run check
npx wrangler login
npx wrangler deploy --config backend/wrangler.toml
```

If using a freshly downloaded source archive that has only the tracked template, first run:

```bash
cp backend/wrangler.toml.example backend/wrangler.toml
```

Check the existing Worker name before deployment. Login is interactive OAuth in your own browser; no secret needs to be sent to Work/chat. If already authenticated, skip login.

For the **backend deployment ZIP** alone, with no source build required (run from its unpacked folder):

```bash
npx wrangler login
npx wrangler deploy --config backend/wrangler.toml
```

This ZIP's `backend/wrangler.toml` uses `./worker.mjs`. The source config and packaged config have deliberately different relative paths.

## Required binding/settings

- Durable Object binding **IMAGE_SESSIONS**, class **ImageSession**, same Worker.
- Existing migration **v1-image-sessions**, `new_sqlite_classes = ["ImageSession"]`. Preserve this migration history; do not reset namespaces. If an existing deployed Worker uses Cloudflare's newer `exports` DO configuration already, retain that established configuration; never switch it back to migrations blindly.
- Plain vars: **VISION_PROVIDER=openrouter**, **OPENROUTER_MODEL=minimax/minimax-m3**, **OPENROUTER_OUTPUT_FORMAT=json_schema**, **OPENROUTER_PROVIDER=Together**. This provider and the compatible grammar schema were tested with real images. Routing is explicit, with no provider fallback; full original schema/semantic validation remains mandatory.
- Production Secret **OPENROUTER_API_KEY**: already added by the user; no re-entry required when deploying to the same Worker.
- Production Secret **BUILDER_SHARED_SECRET**: required by the existing authenticated BDS session create/read endpoints. Must match BDS `AIBUILDER_TOKEN` in its server-only `secrets.json`. Keep existing value if configured; otherwise add through Cloudflare dashboard as Secret and BDS locally. Never put it in a pack/Companion URL.
- **AI_API_KEY** is for the preserved text assistant/provider only; it is not required for OpenRouter image generation. Text assistance retains its previous separate configuration.

## Actual endpoints after deploy

Use the URL Wrangler reports, not a guessed workers.dev subdomain:

- `GET /companion`: serves the actual image upload page, no separate Pages deployment.
- `POST /`: authenticated JSON `{ "mode": "image_session", "dimension": "minecraft:overworld" }`, returns a private session and `/companion#<session>` link. Existing BDS menu issues this call.
- `POST /image/session/<session>`: same-origin Companion upload/generate, passes JPEGs and user prompt to OpenRouter, then validates/seals/stores the real plan.
- `POST /`: authenticated `{ "mode": "image_fetch", "session": "<session>" }`, returns plan to BDS.

A bare GET `/` returns 405 intentionally. Do not interpret it as a failed deploy. Session links are private one-hour capabilities and should not be shared publicly.

## Real acceptance test

After deploy, use the existing BDS private image-session menu, open its link on Android, upload actual photos and request `ابنِ هذا بعرض 40 بلوك والسقف أسود`. A successful response must contain a provider-generated plan passing existing Blueprint/BuildPlan validation, not just HTTP200. Fetch it in-game and use existing placement → preview → confirm → Task Manager → Builder → verification/checkpoint. Real production generation and schema compatibility passed on the runtime-tested Together endpoint; phone/world execution still needs acceptance. If strict schema is rejected by an actual provider endpoint, an explicit server-side `json_object` selection retains all local validators; do not treat that alone as success.

## Result here

The final published version is `7380d5ee-386e-416f-961c-43ec99279814` at the verified workers.dev URL above. Existing `OPENROUTER_API_KEY` and `BUILDER_SHARED_SECRET` were preserved and their names reconfirmed after deployment; their values were never retrieved or printed.

A real building JPEG uploaded to a genuine production ImageSession produced HTTP 200 with an actual MiniMax M3 BuildPlan: dimensions **40 × 6 × 8**, **24 compact operations**, **1,270 block writes**, and the requested flat black-concrete roof. Original Blueprint/BuildPlan schema and semantic validation passed, the native Durable Object saved the plan, and the actual authenticated `image_fetch` endpoint returned the same integrity hash. See [the unedited provider plan](../examples/vision/openrouter-m3-villa.buildplan.json) and [provenance](../examples/vision/provenance.json).

The default upstream was inconsistent about JSON/schema constraints. A verified Structured Outputs endpoint was selected, and only the transport grammar changed: omit unsupported `propertyNames`, convert the current disjoint `oneOf` variants to `anyOf`. The original local schemas were not relaxed. Rejected results remain rejected; public failures now expose fixed codes/bounded numbers instead of upstream text or credentials.

The user renewed Device OAuth after the earlier browser tool timeout cleared temporary files. No further authorization is currently pending. Nine affected/new tests, TypeScript, schema/manifest validation and both package builds passed. The unchanged Builder tests were not repeated. Browser file-picker automation timed out previously; actual Android UX and Bedrock world execution remain untested. Backend HTTP generation/storage/fetch is genuinely verified.
