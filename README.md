# Minecraft AI Assistant — with AI Builder

Minecraft AI Assistant is a real Minecraft Bedrock Add-On designed mobile-first for Android. The existing AI Builder remains its core building tool: the model can choose only registered, schema-validated tools and can never execute raw Minecraft commands or JavaScript.

```text
Arabic / English prompt → Assistant planner → Structured tool calls
        → Tool Registry → validation + risk gate → Bedrock Script API
                                         ↘ build_blueprint → AI Builder
```

## Important platform limitation

Bedrock's `@minecraft/server-net` module works **only on Bedrock Dedicated Server**. It does not work inside the Android/Windows game client or Realms. For that reason this repository produces two honest packages:

| Package | Intended use | AI prompt generation | Experimental toggle |
|---|---|---:|---:|
| `Minecraft-AI-Builder-Android-1.21.100.mcpack` (also `Minecraft-AI-Builder-Android.mcpack`) | Bedrock Android 1.21.100/local worlds and Realms | Local tools, samples, pasted Blueprints/BuildPlans, offline Undo/status/navigation; no open-ended AI | No |
| `Minecraft-AI-Builder-Server.mcpack` | Bedrock Dedicated Server joined from Android | Full Arabic/English tool planning through a secure backend | Beta APIs required for `server-net` and `server-admin` |

Recovery/publication status is recorded in [docs/RECOVERY.md](docs/RECOVERY.md), with [safe manual publishing instructions](docs/MANUAL_PUBLISH.md).

No API key is stored in JavaScript, GitHub, or either `.mcpack`. The provider key exists only in the Cloudflare Worker secret. The Dedicated Server reads a separate shared token from `secrets.json`, where scripts cannot extract its plaintext value.

## Compatibility targets

**Android: Minecraft Bedrock `1.21.100`, `@minecraft/server` `2.1.0`, `@minecraft/server-ui` `2.0.0`, all stable.** The pack upgrades to `0.1.1` using the existing UUIDs to preserve world memory/checkpoints. Navigation uses the action-bar arrow and distance; the native Locator Bar is enabled only on runtimes that expose it. Nearest-biome lookup is unavailable on 1.21.100 and returns an explicit limitation message. Builder, Agent tools, Image-to-Build import, preview, Undo and recovery retain the existing implementation. See [the compatibility audit and verification](docs/ANDROID_1_21_100.md).

**Dedicated Server retains its existing baseline:**

- Minecraft Bedrock `26.40` / engine version `[1, 26, 40]`
- `@minecraft/server` `2.9.0` (stable)
- `@minecraft/server-ui` `2.1.0` (stable)
- Dedicated Server only: `@minecraft/server-net` and `@minecraft/server-admin` `1.0.0-beta.1.26.40-stable`
- Manifest format `2` (stable; manifest v3 remains preview)

Official references rechecked on 2026-09-29 now list server 2.10.0 and later Bedrock releases. This project retains its existing stable 2.9.0 compatibility baseline. Newer runtime gameplay and BDS beta-module compatibility remain to be verified.

## Image-to-Build extension

Open **Image-to-Build** from the main menu. A real phone-browser companion accepts up to three reference views, resizes/normalizes them, calls a configured Vision provider, stores a private session plan, and supports followup revisions. Minecraft fetches a validated BuildPlan and uses the original Builder with collision pauses, previews and Undo. Local Android worlds support JSON import rather than HTTP. See [full workflow, deployment and honest limitations](docs/IMAGE_TO_BUILD.md). Real production Vision now passes on [the existing Cloudflare Worker](https://minecraft-ai-backend.mohamedturiq18.workers.dev/companion) using MiniMax M3 through OpenRouter/Together. A real building JPEG produced a validated 40 × 6 × 8 plan with 1,270 writes; production session storage and authenticated fetch passed. See [actual runtime results and the generated plan](docs/CLOUDFLARE_LIVE_QA.md). Physical Android/BDS remains unverified.

## Features in v0.1.0

- Closed Tool Registry: every tool owns its name, description, input schema, validation, limits, executor, and structured result.
- Structured Agent Response with at most eight calls and at most one world-changing call per v0.1 request.
- Player context: location, look direction, stable crosshair raycast (maximum 32 blocks), saved places, and current action.
- World editor: one-block placement, a deterministic oak-tree feature, bounded `fill`, and source-filtered `replace`.
- World-local waypoint and build metadata persisted with Dynamic Properties.
- Direction and distance in the action bar, updated twice per second; native Locator Bar waypoints on compatible newer runtimes.
- Stable seed-derived biome lookup with a bounded search on server 2.9.0. Unavailable on Android 1.21.100.
- Shared action history for Build, Fill, Replace, and placement snapshots; latest three actions are undoable.
- Risk classes: LOW executes directly, MEDIUM shows a summary, and HIGH requires explicit confirmation with a bounding-box preview.
- Offline deterministic commands for Undo, cancel, status, and navigation to an already saved waypoint. These are local controls, not fake AI.
- Blueprint v1 operations: `set_block`, `fill`, `floor`, `hollow_box`, `walls`, `roof`, `line`, `column`, `repeat`, `mirror`, `door`, `window`, and reusable `component` groups.
- Runtime block-ID validation through Bedrock's `BlockTypes` registry.
- Mobile limit of 25,000 estimated block writes and 128 blocks per axis.
- One fill batch per tick, capped at 384 block writes per batch.
- Build, pause, resume, cancel, live progress, rotation, X/Z movement, and raise/lower.
- Non-destructive particle bounding-box preview.
- Undo snapshots saved by `StructureManager`, tiled to 64×64×64 and limited to the latest three world actions.
- Unfinished build/edit recovery through Dynamic Properties.
- Arabic and English mobile UI.
- Namespaced commands and a touch-friendly shortcut: crouch/sneak and use a compass.
- Cloudflare Worker proxy with an OpenAI-compatible provider adapter.

## Install on Android (local engine)

1. Download `Minecraft-AI-Builder-Android-1.21.100.mcpack`. Exit the world before importing the update. It retains the pack UUID and upgrades its version to 0.1.1; no new public release is claimed while GitHub writes are blocked.
2. Tap the downloaded file and choose **Minecraft**. Minecraft should open and show a successful import message.
3. Create a new world or edit an existing world.
4. Open **Behavior Packs → My Packs → Minecraft AI Assistant - Android → Activate**.
5. No experimental toggle is required for the Android package.
6. Enter the world, get a compass, crouch/sneak, and use the compass. You can also type `/aibuilder:menu`.
7. Start with **Open Assistant** for local tools, or **Test blueprints → Small Modern House → In front of me → Preview → Build**.

Opening the `.mcpack` directly is the supported Android path. Manual copying into `Android/data` is not required.

## Commands

```text
/aibuilder:menu
/aibuilder:assistant
/aibuilder:pause
/aibuilder:resume
/aibuilder:stop
/aibuilder:undo
/aibuilder:status
```

Custom commands use stable Script API and do not require cheats. The compass shortcut is usually easier on a phone. The `aibuilder` namespace remains for compatibility with the working Builder pack.

## Tools that actually work

| Tool | v0.1 behavior | Offline |
|---|---|---:|
| `get_player_position` | Position, dimension, and look vector | Yes |
| `get_target_block` | Stable crosshair block raycast, capped at 32 blocks | Yes |
| `place_block` / `place_feature` | Allowlisted block or deterministic oak tree | Via local UI; natural language needs AI |
| `fill_region` / `replace_region` | Bounded, batched, maximum 25,000 candidate writes | Engine is local; natural language needs AI |
| `build_blueprint` | Full validated AI Builder pipeline | Samples and pasted JSON work offline |
| `undo`, status, cancel | Shared action engine and snapshots | Yes, including exact offline phrases |
| waypoint save/list/navigation | Dynamic Properties + action-bar arrow/distance; native Locator Bar where supported | Yes |
| `find_biome` | Bounded `calculateClosestBiomeFromSeed` on server 2.9.0; explicit unavailable response on 1.21.100 | Newer runtime only; natural language needs AI |

Stable Script API does **not** currently expose a reliable nearest-structure search. The pre-release structure query only reports generated structures containing a supplied location; it does not locate the nearest village. Therefore “nearest village” and arbitrary nearest structures are deliberately not advertised or implemented. Biome results can differ from terrain modified after generation because the stable API calculates from the world seed.

## Use real AI from Android

Run the Dedicated Server package on Bedrock Dedicated Server, then join that server from Minecraft Android. The phone gets the same in-game form; the server performs the authorized HTTPS request and returns a data-only Agent Response.

### 1. Deploy the Worker

The free Cloudflare Workers tier is suitable for early testing, but the selected AI provider may have its own rate and price limits.

```bash
npm ci
npm run build
cp dist/backend/wrangler.toml.example backend/wrangler.toml
npx wrangler secret put AI_API_KEY --config backend/wrangler.toml
npx wrangler secret put BUILDER_SHARED_SECRET --config backend/wrangler.toml
npx wrangler deploy --config backend/wrangler.toml
```

For images, also set `AI_VISION_MODEL` and keep the Durable Object binding/migration in the example. Set `AI_BASE_URL`, `AI_MODEL`, and `AI_STRUCTURED_OUTPUT` in the copied Wrangler file. `json_object` is the compatible default; use `json_schema` when the chosen provider/model supports strict Structured Outputs.

### 2. Configure Bedrock Dedicated Server

Install `Minecraft-AI-Builder-Server.mcpack` into the server world's behavior packs and enable **Beta APIs** for that world. In the BDS root:

`config/default/permissions.json`

```json
{
  "allowed_modules": [
    "@minecraft/server",
    "@minecraft/server-ui",
    "@minecraft/server-admin",
    "@minecraft/server-net"
  ]
}
```

`config/default/variables.json`

```json
{
  "AIBUILDER_ENDPOINT": "https://YOUR-WORKER.workers.dev/"
}
```

`config/default/secrets.json`

```json
{
  "AIBUILDER_TOKEN": "THE-SAME-RANDOM-VALUE-AS-BUILDER_SHARED_SECRET"
}
```

Do not commit `secrets.json`. Restart BDS after changing configuration. Full BDS setup details are in [docs/DEDICATED_SERVER.md](docs/DEDICATED_SERVER.md).

## Blueprint example

```json
{
  "version": 1,
  "name": "Modern House",
  "size": { "x": 20, "y": 10, "z": 15 },
  "operations": [
    {
      "type": "floor",
      "from": [0, 0, 0],
      "to": [19, 0, 14],
      "block": "minecraft:smooth_quartz"
    },
    {
      "type": "walls",
      "from": [0, 1, 0],
      "to": [19, 8, 14],
      "block": "minecraft:white_concrete"
    }
  ]
}
```

The AI never sends raw Minecraft commands. An Agent Response is rejected before execution if its tool, argument schema, blocks, region, step count, or total budget are unsafe. A nested Blueprint is then subjected to the original full Blueprint validator again.

## Development

```bash
npm ci
npm run check
```

`npm run check` runs strict TypeScript checks, unit/performance-simulation tests, JSON Schema and manifest validation, bundles both Script API entry points, builds the Worker, and packages both `.mcpack` files.

The previous full suite passed 49 tests. This production follow-up adds four tests and reruns nine affected tests, all passing; the unchanged Builder tests were not repeated. The suite covers malformed image requests, BuildPlan integrity/schema/detail/snapshot caps, multiple views and followup context, session expiry/restart, provider transport/auth/body limits, engine conflict/recovery/Undo, closed tool input schemas, and Blueprint validation, rotations, mirrors, repeats, estimated block counts, operation expansion, Agent Response allowlisting/step limits/risk classification, batch caps, and 1k/5k/10k/25k scheduling. The older snapshot passed an official Bedrock Dedicated Server startup smoke; this extension has only local unit/API-double integration coverage and has not repeated that smoke. touch UX and final Android gameplay still require a physical or emulated Bedrock client because Mojang does not provide it in GitHub Actions.

## Architecture

```text
src/agent         structured responses, policy, registry, tool executors
src/blueprint     Blueprint types, compiler, transforms, validation
src/builder       shared batching, world transforms, execution engine
src/memory        world-local waypoints, builds, and recent actions
src/navigation    Locator Bar and throttled direction/distance guidance
src/storage       Dynamic Properties and StructureManager action history
src/ui            assistant/builder mobile forms and particle preview
src/planner       offline capability guard and BDS HTTPS adapters
backend           secure AI proxy, agent schema, and system prompts
src/image         BuildPlan integrity/schema and mobile image import/session UI
schemas           Blueprint and BuildPlan JSON Schemas
examples          valid sample blueprints
tests             pure logic and scheduler tests
tools             validation and packaging
```

## Security

- No `eval`, downloaded JavaScript, command execution, or raw AI commands.
- Allowlisted `minecraft:*` block identifiers plus runtime registry lookup.
- Agent response and every argument are validated before a tool runs; Blueprint validation then runs again before a build starts.
- Provider API key remains in Worker secrets.
- BDS shared token remains a `SecretString` and is passed directly into the HTTP header.
- Active world changes are single-flight; a second build/edit is rejected.
- Maximum eight planned calls, one world-changing call per v0.1 request, 32-block raycast, 25,000 candidate block writes, and bounded biome search.
- Cancel leaves an Undo snapshot so partial changes can be restored.

## First AI prompt

```text
ابنِ أمامي بيت مودرن 20x15، طابقين، واجهة زجاجية، حديقة ومسبح صغير، واستخدم الخشب الغامق والكوارتز الأبيض
```

Other supported examples include `احفظ هذا المكان باسم البيت`, `وين البيت؟`, `حط شجرة في المكان اللي أشير عليه`, and `خلي سطح 20x20 حولي ذهب`. Open-ended natural language requires the Dedicated Server/backend path; saved-waypoint navigation, Undo, cancel, and status continue working when that connection is unavailable.

## Official references

- [Bedrock 26.40 Creator update](https://learn.microsoft.com/minecraft/creator/documents/update1.26.40?view=minecraft-bedrock-stable)
- [Script API module reference](https://learn.microsoft.com/minecraft/creator/scriptapi/minecraft/server/minecraft-server?view=minecraft-bedrock-stable)
- [Custom commands](https://learn.microsoft.com/minecraft/creator/documents/scripting/custom-commands?view=minecraft-bedrock-stable)
- [Android Add-On installation](https://learn.microsoft.com/minecraft/creator/documents/gettingstarted?view=minecraft-bedrock-stable)
- [Dedicated Server scripting](https://learn.microsoft.com/minecraft/creator/documents/bedrockserver/scripting?view=minecraft-bedrock-stable)
- [Entity raycasting](https://learn.microsoft.com/minecraft/creator/scriptapi/minecraft/server/entity?view=minecraft-bedrock-stable)
- [Locator Bar / LocationWaypoint](https://learn.microsoft.com/minecraft/creator/scriptapi/minecraft/server/locationwaypoint?view=minecraft-bedrock-stable)

## OpenRouter Vision extension

The preserved Image-to-Build path now supports `OpenRouterVisionProvider`, default `minimax/minimax-m3`, configurable via `OPENROUTER_MODEL`. The key is a Worker **Secret** `OPENROUTER_API_KEY`, never part of the pack or Companion. See [safe setup and actual QA status](docs/OPENROUTER_VISION.md). The deployed configuration pins `OPENROUTER_PROVIDER=Together` with strict JSON Schema output. The transport adapts two unsupported grammar keywords while all original validators remain authoritative. Real image generation, validated BuildPlan output and production session fetch pass; [the generated plan](examples/vision/openrouter-m3-villa.buildplan.json) is actual provider output, not a fixture. Physical gameplay remains untested.

For deploying to an existing Cloudflare Worker that already has its Production Secret, see [exact deployment commands and bindings](docs/CLOUDFLARE_DEPLOY.md). Packaged Wrangler configs now resolve their bundled Worker entry correctly.
