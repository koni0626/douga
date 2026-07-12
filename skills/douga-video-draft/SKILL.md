---
name: douga-video-draft
description: Create or revise editable Douga video projects from novels, scripts, storyboards, generated images, narration, music, or other local assets through the Douga REST API. Use when Codex is asked to turn source material into a YouTube video draft, short promotional video, narrated story, storyboard-based timeline, or any video that should remain editable in the Douga application.
---

# Douga Video Draft

Create an editable Douga timeline instead of rendering a final video directly.

## Workflow

1. Read the source work, its continuity guide, character references, and visual references before planning.
2. Decide the target platform, aspect ratio, duration, audience, tone, narration, captions, shots, audio, and camera effects.
3. Create `video/youtube_plan.md`, `video/narration.md`, `video/storyboard.json`, and `video/douga_manifest.json` beside the source work when the repository permits it.
4. Generate or locate every referenced image and audio file. Keep paths relative to the manifest directory.
5. Read [references/manifest.md](references/manifest.md) before writing the manifest.
6. Confirm `DOUGA_API_URL` and `DOUGA_API_TOKEN` exist without printing the token.
7. Locate the Douga repository and run its deterministic client:

```powershell
<douga-repo>\.venv\Scripts\python.exe -m scripts.douga.create_video_draft <manifest-path>
```

8. If validation fails, fix the manifest or assets and rerun with the same idempotency key. Do not bypass validation.
9. Return the Douga project ID, editor URL, validation warnings, and created artifact paths.

## Safety

- Never place an API token in source files, manifests, logs, or chat output.
- Never read assets from paths outside the manifest directory.
- Preserve existing human edits. Fetch the latest project and honor `lock_version` when revising.
- Reuse the same idempotency key for retries of the same draft; use a new key only for an intentionally separate project.
- Do not request MP4 export or publish to YouTube unless the user explicitly asks.
- Stop on ownership, scope, hash, MIME, validation, or revision conflicts and report the safe API error code.
