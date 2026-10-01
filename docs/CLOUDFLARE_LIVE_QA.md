# Actual Cloudflare runtime QA — September 30, 2026

Real production Image-to-Build now passes through the preserved provider/session/validator path. No fixture, mock, manually repaired blueprint, or new backend was used.

| Check | Actual result |
| --- | --- |
| Existing Worker | `minecraft-ai-backend`; no new Worker created |
| Final deployment | `7380d5ee-386e-416f-961c-43ec99279814` |
| Verified public Companion | <https://minecraft-ai-backend.mohamedturiq18.workers.dev/companion>, HTTP 200; actual HTML/UI loaded |
| Existing Production Secrets | `OPENROUTER_API_KEY`, `BUILDER_SHARED_SECRET`; names reconfirmed after deploy, values never retrieved, printed, replaced, or packaged |
| Native production session | Created through the actual authenticated Worker handler and Cloudflare `ImageSession` Durable Object |
| Model | `minimax/minimax-m3`, routed explicitly to `Together` |
| Real image input | Actual building JPEG, not the test fixture, uploaded to production `/image/session/<private capability>` |
| Output format | Strict JSON Schema, with runtime-tested provider grammar compatibility |
| Accepted production BuildPlan | HTTP 200, **40 × 6 × 8**, **24 operations**, **1,270 block writes**, requested flat black-concrete roof |
| Original validation | Blueprint and BuildPlan schemas, block allowlist, relative coordinates, estimates, detail/volume caps and integrity checks passed |
| Native session persistence | Passed; saved validated plan read back through the actual authenticated `image_fetch` handler with the same hash |
| Source photograph storage | No image bytes in the persisted plan; only view/dimensions metadata |
| Physical Android/file picker | Not tested successfully; browser automation timed out in an earlier attempt |
| Minecraft / BDS world execution | Not tested this round; no real placement/preview/build/Undo/restart claim |
| Current local checks | Nine affected/new tests, TypeScript, schema/manifest validation and both packages passed |
| Previous test baseline | 49 tests passed previously; four new cases added. Unrelated completed Builder tests were not rerun |
| GitHub Actions / Release | Not run/created in this round at the time of this record |

## Genuine sample

- [Unedited actual provider BuildPlan](../examples/vision/openrouter-m3-villa.buildplan.json)
- [Its nested Blueprint](../examples/vision/openrouter-m3-villa.blueprint.json)
- [Request/image provenance and verification results](../examples/vision/provenance.json)

The requested width is exactly 40. The roof operation covers `[0,5,0]` to `[39,5,7]` with palette entry `roof = minecraft:black_concrete`. The sample was validated and saved without editing provider geometry, replacing output, or raising limits. Detail was `DETAILED`, retaining its existing 10,000-write cap; the plan uses only 1,270 writes.

## Actual failures repaired

The default upstream accepted `response_format` but inconsistently enforced JSON/schema constraints. Observed failures included non-JSON content, singleton component definitions, overlong descriptions and out-of-bounds coordinates. They remained rejected.

The public OpenRouter [model catalog](https://openrouter.ai/api/v1/models) and [M3 endpoints](https://openrouter.ai/api/v1/models/minimax/minimax-m3/endpoints) were checked. CoreWeave explicitly rejected grammar keywords `propertyNames` and `oneOf`, then returned a transient upstream 429. Together accepted the compatible strict schema and generated a plan passing the original validators. `OPENROUTER_PROVIDER=Together` pins that verified endpoint with provider fallback disabled; the model remains MiniMax M3.

Only the provider grammar omits `propertyNames` and converts current disjoint `oneOf` variants to `anyOf`. The original Blueprint/BuildPlan schemas and semantic validator are unchanged and still applied before storage or execution. Tests explicitly prove a bad palette key admitted by the provider grammar is rejected locally. Raw command operations remain forbidden.

Public errors now add fixed `VISION_*` codes and bounded numeric status/budget fields. They never return upstream error bodies or arbitrary exception messages.

## QA authorization

A temporary private edge preview for this existing Worker inherited its runtime secrets and used a service binding to the published production handler. This issued the genuine production session and authenticated plan fetch without bringing the shared secret outside Cloudflare. The image generation itself used the published production upload endpoint. The helper did not add a public unauthenticated session route or create/persist another Worker. Private session/OAuth/preview capabilities are excluded from the examples and packages.

The user renewed Device OAuth after an earlier browser timeout cleared temporary files. Deployment and final real-image QA then succeeded. No further authorization is pending.

Reference: actual Villa Savoye exterior photographs from a Library of Congress contact sheet, <https://www.loc.gov/item/2020714937/>; source <https://tile.loc.gov/storage-services/service/pnp/ppmsca/65100/65198v.jpg>. The two exterior views were cropped to a real normalized 355 × 139 JPEG. The source photograph is not included in the distributable sample; its SHA256/provenance is recorded. An earlier downloaded Wikimedia reference depicted a sign and was replaced before the meaningful building tests.

## Remaining Minecraft acceptance

Join the configured BDS from Android, create a private Companion session in the existing menu, upload a real gallery image, fetch the validated plan, then placement → preview → confirm → Builder → verification/checkpoint. Alternatively, import the saved real BuildPlan in a local Android world using the existing import menu; large JSON may exceed practical clipboard/form limits. Local Android worlds have no Script API HTTP.

Actual block placement, direction/rotation/preview, cancellation, Undo, restart recovery, collision/unloaded-chunk handling and phone profiling remain gameplay acceptance checks. Data/schema validation is not a substitute for testing the world.
