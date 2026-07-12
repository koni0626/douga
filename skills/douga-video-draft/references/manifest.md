# Douga manifest v1

## Required shape

```json
{
  "manifest_version": 1,
  "idempotency_key": "episode-012-youtube-draft-v1",
  "project": {
    "name": "Episode 12 YouTube",
    "locale": "ja",
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "duration_ms": 90000
  },
  "assets": [
    {
      "key": "opening",
      "path": "assets/opening.png",
      "kind": "image"
    }
  ],
  "clips": []
}
```

## Clip types

- `image`: require `asset_key`, `start_ms`, `end_ms`; allow `fit` as `contain` or `cover`, transform fields, `z_index`, and animation.
- `caption` or `text`: require `text`, `start_ms`, `end_ms`; allow transform, font, color, `z_index`, and animation.
- `shape`: require timing; allow rectangle or ellipse, fill, transform, and `z_index`.
- `audio`: require `asset_key` and `start_ms`; allow `role`, duration, trim, volume, loop, fades, and ducking.
- `camera`: require `preset`, `start_ms`, and `end_ms`; allow intensity and period.

Supported object animations are `slow_zoom_in`, `slow_zoom_out`, `fade_in`, and `fade_out`. Camera presets must match the Douga Project Schema.

For a custom animation, set `keyframes` on a visual clip. Each keyframe requires either absolute `time_ms` or clip-relative `offset_ms`, and may override `easing`, `x`, `y`, `width`, `height`, `rotation`, `opacity`, `flip_x`, and `flip_y`. Supported easing values are `linear`, `ease_in`, `ease_out`, `ease_in_out`, `bounce`, and `step`.

To revise an existing project, add top-level `project_id` and `base_lock_version`. Obtain both from the latest project response. The client refuses the update if the lock version changed, so it never silently overwrites human edits. Omit both fields when creating a new project.

Keep all times as integer milliseconds. Arrange visual clips using `z_index`; higher values render in front. Use one stable `idempotency_key` per intended project draft.
