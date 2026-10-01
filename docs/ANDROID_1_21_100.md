# Android Bedrock 1.21.100 compatibility fix

The phone's reported `no runtime or context available` error occurred with a manifest requiring unavailable server 2.9.0 and server-ui 2.1.0. Changing only `min_engine_version` cannot fix unavailable script dependencies or named imports.

The corrected Android pack uses server **2.1.0**, server-ui **2.0.0**, manifest format 2, and minimum engine `[1,21,100]`. No Beta APIs/experimental toggles are required. The header and script module are version **0.1.1**; both UUIDs are retained so importing upgrades the existing pack and world-local Dynamic Properties remain associated with it. The Dedicated Server manifest and backend are unchanged.

## Audit of the actual Android entry point

`src/main.ts` and its full import graph are checked against the publisher's exact npm definitions for server 2.1.0 and server-ui 2.0.0 using `tsconfig.android.json`. The project's normal newer-server typecheck remains in place. Bundled named imports are also compared with the old definitions' runtime exports, then linked through actual ESM imports in a stable-surface test double that has no newer exports.

| Used API | 1.21.100 result / change |
|---|---|
| `system.beforeEvents.startup`, custom command registry, `CommandPermissionLevel.Any`, `cheatsRequired: false` | Stable 2.1.0; unchanged registration and next-tick dispatch |
| `world.afterEvents.itemUse`, `playerSpawn`; `system.run/runTimeout/runInterval/clearRun/currentTick` | Available; unchanged scheduling and shortcuts |
| `Player`, permissions, look vector/raycast, location/dimension, messages/action bar | Available; unchanged Agent context, navigation direction, progress |
| `ActionFormData`, `MessageFormData`, `ModalFormData`, dropdown/slider/text-field options and submit button | All used methods/options available in UI 2.0.0; no DDUI imports |
| `BlockTypes.get`, `BlockPermutation.resolve/getAllStates/type`, `BlockVolume` | Available; unchanged block/permutation validation |
| `Dimension.heightRange/getBlock/setBlockPermutation/fillBlocks`, block filter, `Block.isAir/permutation` | Available; unchanged batched execution, collision validation and verification |
| `Dimension.isChunkLoaded` | Absent; compatibility helper probes one block per affected chunk with stable `getBlock`, rejecting undefined/throws. Native method retained where present |
| `world.structureManager.createFromWorld/get/place/delete`, `StructureSaveMode.World` | Available; unchanged persistent tiled Undo snapshots |
| World/player Dynamic Properties | Available; unchanged world memory and resumable checkpoints |
| `Dimension.spawnParticle` | Available; unchanged non-destructive bounds preview |
| `LocationWaypoint`, `WaypointTexture`, `Player.locatorBar` | Absent; removed unconditional named imports. Guidance continues with arrow/distance at two updates/second; optional native markers on newer runtimes |
| `BiomeTypes`, `calculateClosestBiomeFromSeed` | Absent; namespace capability checks and explicit bilingual unsupported response; no fake lookup/raw command fallback. Newer-runtime functionality retained |
| Image-to-Build / BuildPlan validation | Existing import, schema/semantic validation, placement/rotation, preview, Builder, checkpoints and Undo unchanged |

The Android import graph has only `@minecraft/server` and `@minecraft/server-ui` as external imports. It does not import server-net/server-admin, frontend/backend code or credentials. Offline/HTTP limitations are unchanged.

## Reproduce

```bash
npm ci
npm run typecheck
node --import tsx tests/android-compatibility.test.ts
npm test
npm run build:android
unzip -t dist/Minecraft-AI-Builder-Android-1.21.100.mcpack
```

The compatibility tests cover old-export ESM linking, early-execution safety, seven registered commands, spawn greeting and compass/menu dispatch; the preserved real-provider BuildPlan example through validation and rotated Builder execution; unloaded-chunk rejection, pause/resume, scheduler restart and checkpoint recovery, cancel/Undo, partial-batch recovery, world-memory waypoint navigation and unsupported-biome handling. These use API test doubles, **not a running Minecraft instance**. Physical Android 1.21.100 execution remains to be checked on the phone; packaging/typechecking alone cannot certify game behavior or mobile performance.

## Import the update

Leave the world, tap the `.mcpack` and open with Minecraft. Verify **Minecraft AI Assistant - Android 0.1.1** is active in Behavior Packs, then reopen the world. Use `/aibuilder:menu` or sneak and use a compass. Test a small blueprint, Preview, Build, Pause/Resume and Undo. The existing pack UUID is preserved; do not delete the world or its memory to install the update.

## Official evidence

- [Bedrock 1.21.100 release notes: custom commands and permissions moved to stable 2.1.0](https://www.minecraft.net/en-us/article/minecraft-1-21-100-bedrock-changelog)
- [Bedrock 1.21.90: UI 2.0.0 released, UI 2.1.0 remains beta](https://www.minecraft.net/fr-ca/article/minecraft-1-21-90-bedrock-changelog)
- [Server changelog: isChunkLoaded added in 2.3.0; newer Locator/biome APIs](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/changelog?view=minecraft-bedrock-stable)
- [UI changelog and existing form methods](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-ui/changelog?view=minecraft-bedrock-stable)
- Exact Microsoft-published npm type packages pinned as development-only aliases: `minecraft-server-1-21-100` → `@minecraft/server@2.1.0`; `minecraft-server-ui-1-21-100` → `@minecraft/server-ui@2.0.0`.
