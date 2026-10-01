# Changelog

## Unreleased — Android `/wsserver` compatibility probe

- Added isolated Cloudflare Worker routes `/minecraft-ws` and `/ws-test/health` without changing the existing AI, image-session, or Companion routes.
- Added bounded Minecraft Command WebSocket v1 subscription/response probing with one fixed non-destructive `tellraw` command.
- Added safe metadata-only connection logs, malformed-frame handling, frame/rate limits, tests, and an Android acceptance guide.
- Kept the AI bridge disabled and the Dedicated Server path intact until a physical Android client proves protocol compatibility.

## Android 1.21.100 compatibility / pack 0.1.1 — 2026-09-30

- Retained Android pack UUIDs, raised pack/module version to 0.1.1, and pinned available stable server 2.1.0 / UI 2.0.0 dependencies and engine 1.21.100.
- Replaced unavailable chunk-loading checks with bounded getBlock probes; native checks remain available on newer runtimes.
- Removed unconditional newer named imports. Waypoint guidance uses the existing arrow/distance on 1.21.100; Locator Bar and seed-derived biome lookup remain available on capable newer runtimes. Old runtimes receive an explicit biome limitation message.
- Preserved Agent, Builder, world memory, Undo/recovery and Image-to-Build. Dedicated Server manifest and backend unchanged.
- Added exact old-API typechecks and three compatibility tests covering real bundled ESM linking/early execution and existing game-tool paths through stable API doubles. All 56 tests, both typechecks, manifests and Android packaging pass; physical Android execution still requires phone verification.
- Added `Minecraft-AI-Builder-Android-1.21.100.mcpack` and `npm run build:android` for focused Android packaging.

## Followup from 17e0972 — 2026-09-30

- Preserved all image-to-build code; added real HTTP JPEG upload and disk-session restart QA with an explicit missing-provider gate.
- Configured current Vision model/settings example, real-provider-only smoke CLI and server-only secret/environment guide.
- Validate JPEG envelope and dimensions, bounded upstream JSON, input body types and session storage size; preserve companion link across reload.
- Write-ahead pending batches recover partial/overlapping writes after checkpoint failure; reverify on Pause/Resume and before completion.
- Preserve custom safe batch budgets across restart, guard unfinished tasks and checkpoint discard by owner, and keep dynamic strings within UTF-8 limits.
- Cache intended permutation signatures instead of resolving them per block during recovery.
- 44 tests pass locally, including all original 30; physical Android/BDS/Vision remain blocked by missing runtime/credentials.

## Unreleased extension — 2026-09-29

- Real multi-image phone companion, bounded preprocessing, private expiring Durable Object sessions and an OpenAI-compatible VisionProvider.
- Strict structured BuildPlan with detail budgets, metadata, followup context, integrity checks and reuse of the original Builder.
- Image collision pauses and bounded completed-world verification on recovery.
- Immutable checkpoint chunk banks plus per-batch cursor journal; native Undo snapshot volume capped.
- Standalone Blueprint/BuildPlan JSON Schema validators, runtime permutation preflight, owner controls and closed tool argument validation.
- Actual offline local editor UI; corrected north/south crosshair placement.
- Portable pure-JavaScript ZIP packaging and expanded local QA (original 30 tests).
- GitHub publishing blocked by integration 403; live Vision and new BDS/Android gameplay remain unverified.

## 0.1.0 - 2026-09-29

- First installable Bedrock behavior pack for Android/local worlds.
- Validated Blueprint v1 format with compact building primitives.
- Tick-batched build queue with pause, resume, cancel, progress, rotation, and offsets.
- Persistent build recovery and world-backed, tiled undo snapshots.
- Particle bounding-box preview.
- Arabic and English mobile forms plus namespaced custom commands.
- Dedicated Server package and secure Cloudflare Worker AI proxy.
- GitHub Actions validation, tests, and `.mcpack` packaging.
- Modular AI Assistant core with a closed Tool Registry and structured Agent Responses.
- Stable crosshair raycasting, block/tree placement, bounded fill/replace, and shared action history.
- World-local waypoint/build memory using Dynamic Properties.
- Native Locator Bar navigation with a throttled direction-and-distance action bar.
- Stable seed-derived nearest-biome lookup; unsupported nearest-structure search is intentionally not exposed.
- LOW/MEDIUM/HIGH risk policy, confirmation gates, maximum eight tool calls, and one changing action per v0.1 request.
- Offline local commands for Undo, cancel, status, and saved-waypoint navigation.

## OpenRouter Vision follow-up — 2026-09-30

- Added server-only OpenRouterVisionProvider using verified multimodal MiniMax M3, configurable model and schema response format with compatible endpoint routing.
- Preserved sessions, multi-image/follow-ups, validation and existing Minecraft execution; no synthetic Vision fallback.
- Sanitized network/session error paths and rejected unexpected analysis fields. Added five configuration/schema/real HTTP failure tests; all 49 pass.
- Live provider generation remains blocked by missing OPENROUTER_API_KEY; real Bedrock/Android verification is still outstanding.

## Existing Cloudflare Worker deployment follow-up — 2026-09-30

- Verified existing runtime Secret path into ImageSession/OpenRouter; no adapter or backend replacement.
- Corrected packaged Wrangler entry path, added ready deployment config and preserve-dashboard-vars setting.
- All 49 tests, TypeScript, manifest/schema validation and packaging pass. Production deploy and real Vision test remain blocked by absent Cloudflare authentication in Work.

## Real Cloudflare/OpenRouter production QA — 2026-09-30

- Deployed the existing `minecraft-ai-backend`, preserving both existing Production Secrets; verified Companion HTTP200 and native production ImageSessions.
- Fixed actual M3 endpoint grammar incompatibilities and pinned runtime-tested Together strict output. Full original schemas/semantic limits remain mandatory; no model/fixture fallback.
- Real building JPEG produced an unedited 40 × 6 × 8 BuildPlan, 24 operations, 1,270 writes and a flat black-concrete roof. Production storage and authenticated image_fetch passed; sample and provenance saved.
- Public Vision errors now expose fixed codes/bounded numbers only. Four new tests plus five affected existing tests passed; TypeScript/manifest/schema/package checks passed.
- Physical Android and Minecraft-world E2E remain untested. Existing Builder/Resume/Undo implementation was preserved.
