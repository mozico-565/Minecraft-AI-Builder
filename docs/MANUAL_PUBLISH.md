# Publish the recovered work safely

The follow-up recovery archive includes the complete source, `changes.patch` (all unpublished changes against the older remote content), `since-17e0972.patch` (only this follow-up), both `.mcpack` files, Worker, schemas, QA log and Git history bundle. No secrets, node_modules or `.git` directory are included in source ZIP.

Use an authenticated existing checkout of https://github.com/mozico-565/Minecraft-AI-Builder on `main`. Keep any current edits safe before applying this patch. Do not overwrite newer remote work or force-push the supplied local bundle.

```bash
git switch main
git pull --ff-only
git apply --check /path/to/changes.patch
git apply /path/to/changes.patch
npm ci
npm run check
unzip -t dist/Minecraft-AI-Builder-Android.mcpack
unzip -t dist/Minecraft-AI-Builder-Server.mcpack
git add .
git commit -m "Extend preserved AI Assistant with image-to-build sessions and safe recovery"
git push origin main
```

If patch checking fails, review the changes against current files and merge them; do not reset the repository to the archive. The complete source is provided for review/recovery.

After the new main Actions run is green, inspect its logs/artifacts. Create the requested initial release tag **only if v0.1.0 does not already exist**:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The existing tag-triggered workflow publishes package assets. Inspect its release step and verify both downloadable packs. If v0.1.0 exists, preserve it and choose a new version with corresponding manifest/package/validation changes; never move an existing release tag.

Deploy Worker using README instructions and `backend/wrangler.toml.example`; select `AI_VISION_MODEL`, configure secrets server-side, apply Durable Object migration. Confirm real BDS startup and phone gameplay. Test small image plan on a clear elevated platform, cancel/Undo, then server stop/restart recovery with a deliberately altered completed block. Record phone tick/memory behavior before relaxing limits or advertising 25k as safe.
