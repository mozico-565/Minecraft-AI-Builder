# Real Vision environment — continue from 17e0972

**Latest extension:** OpenRouter Vision uses `OPENROUTER_API_KEY` as a Worker Secret, `VISION_PROVIDER=openrouter`, configurable `OPENROUTER_MODEL=minimax/minimax-m3`, strict JSON Schema and runtime-tested `OPENROUTER_PROVIDER=Together`. See [OpenRouter setup](OPENROUTER_VISION.md). Groq settings below remain the preserved compatible provider option, not the latest Vision default.

The existing Worker now uses its Production Secrets successfully, and deployment was authorized through Device OAuth. Provider/shared-secret values remain inside Cloudflare; they were not copied into Work, the frontend or packages. See [actual real-image production results](CLOUDFLARE_LIVE_QA.md). Do not paste secrets into chat, the behavior pack, a Companion field, source files or a GitHub commit.

## Required deployment settings

| Setting | Location | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Worker Production Secret | Real OpenRouter Vision authentication; already configured |
| `OPENROUTER_PROVIDER` | Worker server variable | `Together`, the runtime-tested strict-output endpoint |
| `OPENROUTER_MODEL` | Worker server variable | `minimax/minimax-m3` |
| `AI_API_KEY` | Worker secret, separate text/compatible provider | Not required for OpenRouter Vision |
| `BUILDER_SHARED_SECRET` | Worker secret | BDS access to session creation/read and text planning |
| `AI_BASE_URL` | Worker server variable | HTTPS OpenAI-compatible API, default Groq |
| `AI_VISION_MODEL` | Worker server variable | Vision-capable model enabled for your account |
| `AI_VISION_REASONING_EFFORT` | Worker server variable, optional | Groq/Qwen instruct mode: `none` |
| `AI_VISION_REASONING_FORMAT` | Worker server variable, optional | Groq/Qwen: `hidden`, keep output JSON only |
| `IMAGE_SESSIONS` | SQLite Durable Object binding + migration | One-hour private persistent sessions |
| `AIBUILDER_ENDPOINT` | BDS `variables.json` | Root HTTPS Worker URL |
| `AIBUILDER_TOKEN` | BDS `secrets.json` | Same value as Worker shared secret; read as `SecretString` |

The example now selects `qwen/qwen3.8-27b`, whose official Groq page currently documents image input, maximum three images, JSON mode, and `reasoning_effort="none"`. It is a **preview provider model**, configurable, not a stable Minecraft API requirement. Account availability and quota must be verified when actually deploying. No paid usage or free quota is assumed. Omit Groq-specific reasoning options with another provider.

## Deploy

Use the existing generated Worker and existing BDS setup in README. The config example already includes the SQLite binding/migration and actual model setting:

```bash
npm ci
npm run check
cp backend/wrangler.toml.example backend/wrangler.toml
npx wrangler secret put AI_API_KEY --config backend/wrangler.toml
npx wrangler secret put BUILDER_SHARED_SECRET --config backend/wrangler.toml
npx wrangler deploy --config backend/wrangler.toml
```

Wrangler reads each secret interactively. Keep the same shared secret only in the BDS root's `config/default/secrets.json` under `AIBUILDER_TOKEN`; configure the Worker URL in `config/default/variables.json`. Do not distribute these files. Activate the server behavior pack and required Beta APIs on BDS. Android joins this server; a local Android world cannot perform Script API HTTP.

## Live Vision smoke, no substitute output

`backend/.dev.vars.example` contains blank secrets and server settings. Copy it to the repository root as `.dev.vars`, fill secrets locally (gitignored), then run with a recent Node 22+:

```bash
node --env-file=.dev.vars --import tsx tools/vision-smoke.ts normalized-front.jpg normalized-side.jpg
```

Inputs must be valid normalized JPEGs <=1536px and within the same upload limits. This calls the real provider, validates its response and saves `.local/vision-smoke/BuildPlan.json`. It never executes Minecraft, synthesizes a fake blueprint, or prints credentials. Without required settings it exits 2 with `status: blocked`, `providerCalled: false`, and the missing variable names. Successful output can then be imported through the existing Minecraft BuildPlan menu. The included tiny test JPEG is explicitly a transport input fixture, not proof of AI quality.

## Local companion / HTTP QA

```bash
node --env-file=.dev.vars --import tsx tools/serve-companion.ts
```

The host serves the actual companion HTML and invokes the actual Worker, session and Vision handlers. Its localhost-only **file storage adapter** implements the storage contract for local integration; it is not Cloudflare's workerd/SQLite runtime. Provider calls are real when configured. The generated private URL is printed; provider/shared credentials are not. State is in `.local/image-sessions/`, gitignored. Cloudflare HTTPS deployment is the supported phone path; `127.0.0.1` on a phone refers to the phone itself.

Creating/reading a session now works before a provider key is configured. Uploading valid images in that condition returns HTTP 503 `VISION_NOT_CONFIGURED`, no plan, and consumes no provider attempt. HTTP QA verifies that exact gate using real network requests, a real JPEG and disk-backed session restart; it does not claim Vision or Android UI passed.

## Acceptance still requiring real runtime

1. Open a BDS-created private session link on Android, upload camera/gallery photos, generate using real credentials, and fetch the plan in-game.
2. Confirm elevated clear placement/rotation/particle preview; build and inspect the result. Image placement starts one block higher by default to avoid replacing occupied ground.
3. Pause/resume after modifying a completed block: it must pause with `PAUSED_CONFLICT`.
4. Restart BDS during a multi-batch task, recover it, confirm that completed and write-ahead pending states are verified, and finish without duplicate snapshots.
5. Cancel/Undo; change dimension; move far enough to unload chunks; return/resume. Profile 1k/5k/10k/25k on the phone before advertising upper bounds as freeze-free.

This workspace had no BDS binary. Vendor download failed through the configured proxy and direct DNS; the cloud browser denied localhost and no local Chromium binary existed. These are Minecraft/device QA gates, not successful world tests. Cloudflare production Vision/schema/semantic/storage/fetch is now verified separately; browser image-picker automation and Android UX are still not claimed.

References: [Groq model](https://console.groq.com/docs/model/qwen/qwen3.8-27b), [Bedrock networking](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-net/minecraft-server-net?view=minecraft-bedrock-experimental), [Cloudflare storage limits](https://developers.cloudflare.com/durable-objects/platform/limits/).
