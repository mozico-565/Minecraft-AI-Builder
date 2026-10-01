# Advanced Image-to-Build: implementation and operating limits

This extends the original Builder and Assistant. No second building engine exists.

## Real workflow

1. Deploy the bundled Worker with its SQLite-backed `IMAGE_SESSIONS` Durable Object binding/migration.
2. Keep existing Worker Production Secrets `OPENROUTER_API_KEY` and `BUILDER_SHARED_SECRET`. The verified Vision setup is `VISION_PROVIDER=openrouter`, `OPENROUTER_MODEL=minimax/minimax-m3`, `OPENROUTER_OUTPUT_FORMAT=json_schema`, `OPENROUTER_PROVIDER=Together`. See [actual production results](CLOUDFLARE_LIVE_QA.md). The preserved text/compatible provider uses separate `AI_API_KEY`/`AI_BASE_URL` settings.
3. Configure the existing BDS endpoint and `SecretString` token. Join the server from Android.
4. Open `/aibuilder:menu` → **Image-to-Build** → **New image session**. Copy the private URL from the form into the phone browser.
5. Pick one to three JPEG/PNG/WebP photographs with Android's browser file picker. Label their views (`front, side, rear`). Describe the desired building in Arabic or English, choose detail/scale, and generate.
6. The browser decodes image orientation, resizes the longest side to at most 1536px, converts to bounded JPEG, and rejects unsupported/corrupt/oversized input. Source limits: 12 MB/file, 24 MP/image, three images. Normalized payload: 1.5 million characters/image, 4.6 MB/request. Server validates normalized metadata/magic/base64; the provider performs actual image decoding. The server does not independently fully decode JPEG files.
7. The actual Vision provider receives all views in a single multimodal request. A `VisionProvider` interface isolates the adapter. Missing credentials produce an explicit error. Production never uses a fixture or cached sample instead of AI.
8. Worker validates the Blueprint, constructs and validates a structured BuildPlan, and stores the plan (not source-image bytes) in a one-hour session. Five generation/revision attempts maximum, one in flight, ten-second spacing, 45-second upstream timeout. Validated session plans are capped at 96 KB UTF-8; credentials missing from the backend produce 503 without a fake plan or quota consumption.
9. Return to Minecraft → **Fetch image plan**. Choose placement/rotation/offsets, preview and confirm. The same Builder validates block permutations/chunks/height and captures Undo before batched writes.
10. For a followup, enter another prompt in the same companion session. It receives the previous plan and returns a complete revision. New images are optional; without them the prior geometric analysis is reused. Applying a revision in an already occupied area pauses on conflicts; use Undo or a new clear placement. There is no automatic destructive incremental world diff.

The companion URL is a random 128-bit bearer capability. Keep it private. It lives in a URL fragment initially; the page removes it from browser history and uses a same-origin API. No provider/shared server secret is sent to the browser. Link possession permits changing that session's candidate plan; it never confirms changes to the Minecraft world. Worker authentication is required to create/read sessions from BDS. Sessions are scoped to the requesting player's world property and target dimension. There is no browser-only public session creation or account system in this version.

## Local Android worlds

HTTP does not exist in local Bedrock Script API. **Import BuildPlan JSON** works without HTTP after generation elsewhere. A companion session must first be created on a configured Dedicated Server; download its plan and transfer/paste the full JSON in the local world. Large JSON may exceed practical mobile clipboard/form limits. Automatic gallery upload and automatic plan retrieval within a local Android world are not supported. Blueprint JSON import and local tools remain available offline.

## BuildPlan and mobile bounds

The strict `schemas/build-plan.schema.json` wraps the existing Blueprint; the bundled standalone validators execute without runtime code generation/eval. Plan/task IDs, source views, target dimension/anchor/orientation, dimensions, scale/detail, assumptions/choices, palette, steps/dependencies, estimates, bounds, safety/persistence/progress/checkpoint fields, and an integrity checksum are required. Components/operations live inside the existing Blueprint. Only one build step is executable in this version; arbitrary multi-step DAGs/layers are not advertised as implemented.

| Detail | Maximum estimated writes |
|---|---:|
| FAST | 2,000 |
| BALANCED | 5,000 |
| DETAILED | 10,000 |
| ULTRA | 25,000 |

All modes remain inside 128 blocks per axis and 100,000 blocks in the snapshot bounding volume. Scale 0.25–4 instructs Vision how to infer dimensions; a larger scale cannot bypass validation. Role-based palette references and existing compact repeat/mirror/component operations reduce payload size. Detail modes constrain the prompt and validator; they are not a guarantee of photographic fidelity or a measured provider cost.

Image builds default to `pause_on_conflict`. Each batch checks occupied blocks before modifying that batch: air, matching intended blocks and unchanged blocks previously placed by the current task are allowed. Occupied terrain, water or existing buildings cause a pause; raise the foundation above occupied ground or clear the intended site explicitly. Earlier batches may already have been applied when a later conflict is detected. There is no terrain-wide predictive collision preview or automatic landscape adaptation.

The engine persists a cursor after every batch, while storing immutable plan data once in two alternating chunk banks. A header points to the completed bank; a small cursor journal avoids rewriting the full plan each tick. The payload and compiled batches carry integrity checksums (not cryptographic signatures). A write-ahead pending cursor is saved before each native batch, then committed after it. Interrupted/failed writes replay that batch idempotently, including legitimate overlaps with completed blocks. On recovery and Pause/Resume of an image build, completed blocks are checked in at most 384 positions per tick against the final state of completed batches, including overlaps. A bounded final verification also runs before reporting completion. Differences pause with `PAUSED_CONFLICT`; nothing is blindly overwritten. Owner/dimension checks guard recovery and active action controls. Leaving the task dimension or disconnecting pauses the action.

Undo snapshots use world-persisted structures, no entities, and retain the latest three actions. Bounding-volume caps limit snapshot cost, but capture/restore are synchronous native calls. Low-end Android performance has not been benchmarked and no claim of freeze-free 25k operation is made. Watchdog settings are unchanged. Redo, copied arbitrary world structures, automatic terrain flattening/surface scans and unbounded agent loops remain unimplemented.

## Verification and remaining external gates

`npm run check` runs TypeScript, all test cases, both JSON schemas/examples/manifests, Android/server bundles and Worker packaging. The previous full 49-test run passed; the production follow-up added four tests and passed the nine affected tests without repeating the unchanged Builder suite. Engine integration tests use a test-only API double; provider transport tests mock fetch only inside tests. Those tests verify behavior, not physical device TPS or actual AI quality.

The previously recorded BDS startup smoke belongs to the older Builder/Assistant snapshot. The server runtime is no longer present in the recovered workspace, so it was not repeated for this extension. Real Cloudflare Vision generation, original schema/semantic validation, production storage and authenticated fetch now pass; the unedited provider plan is in `examples/vision/`. New BDS startup, Android image-picker/device UX, world block placement, restart persistence under actual server shutdown, and 1k/5k/10k/25k phone profiling remain acceptance gates. They must not be marked complete without those runs.

## Official documentation rechecked 2026-09-29

- [Script API versions](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/minecraft-server?view=minecraft-bedrock-stable): now lists stable 2.10.0 as well as 2.9.0. Compatibility dependencies remain pinned to the existing 2.9.0 / Bedrock 26.40 baseline; this extension did not replace working module versions merely to use newer APIs.
- [HTTP limitations](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-net/minecraft-server-net?view=minecraft-bedrock-experimental): Dedicated Server only, pre-release.
- [Groq Vision](https://console.groq.com/docs/vision): multimodal image inputs; select currently enabled models rather than assuming an old model ID.
- [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/): SQLite-backed objects available on Free plan subject to limits; AI provider usage is separate.
- [Bedrock 26.50 release](https://www.minecraft.net/fr-ca/article/minecraft--bedrock-edition-26-50-changelog) and [26.52 hotfix](https://feedback.minecraft.net/hc/en-us/articles/49175370527501-Minecraft-Bedrock-Edition-26-52-Hotfix-Changelog): newer release information exists; compatibility with those clients/servers still needs actual gameplay validation. BDS beta net/admin versions may need a coordinated version update for a newer runtime.

The followup from local commit 17e0972 added real loopback HTTP/session tests, a no-fallback live provider smoke CLI, stronger JPEG metadata validation, write-ahead recovery and Arabic-safe property chunks. See [environment and current external QA gates](ENVIRONMENT.md).
