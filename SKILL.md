---
name: renderingvideo-generator
description: Create or revise RenderingVideo schema JSON and validate it through the public preview API without credentials. Returns a temporary preview URL and temp ID; supports the current schema's media, SVG, subtitle, layout, template, and 3D elements.
---

# RenderingVideo Public Preview

Use this skill when the task needs a public temporary preview. Permanent video tasks, hosted uploads, credit usage and downloadable renders use the authenticated API instead.

## Read the current schema

Read `https://renderingvideo.com/docs/api-and-usage.md` and `/docs/json-spec.md` before constructing a preview. Read `/docs/clips.md`, `/docs/elements.md` and the selected element pages for supported fields; read `/docs/animation-and-timing.md` when adding timing or motion.

The schema supports grouped assets (including fonts, SVGs, subtitles and models), asset references, nested layouts, templates, animations and keyframes. Choose fields from the relevant docs. Put dimensions under `transform`, and asset references in `src`, `svg` or the documented field rather than a clip-level `$ref`. `examples/enhanced-schema.json` is a self-contained grouped-SVG/gradient/animation example.

## Generate a preview

```bash
node scripts/gen-preview.cjs example.json --json
node scripts/gen-preview.cjs examples/enhanced-schema.json --json
```

- POST the schema itself, with top-level `meta` and `tracks`, to `https://video.renderingvideo.com/api/preview`. Do not wrap it in `{ "config": ... }`.
- No API key or agent credential is required or sent, even if the environment contains one.
- `RENDERINGVIDEO_VIDEO_ORIGIN` overrides the video service origin for a local/test deployment. `RENDERINGVIDEO_TIMEOUT_MS` controls the timeout (90 seconds by default).
- `--json` emits one JSON object with absolute URLs; omit it for a short readable summary.
- Keep remote media publicly accessible and use supported references. Preview creation checks server acceptance, not whether every frame looks correct; inspect the returned viewer when visual confirmation is needed.

## Return and revise

Return `tempId` and the absolute shareable URL, preferring `viewerUrl`, then `previewUrl`, then the returned `url`/`playerUrl`. Preserve `expiresIn` when provided; previews normally last 7 days, but report the server's actual value. Do not invent a viewer route or expiry when fields are absent.

If the preview needs correction, revise the schema and create a new preview. If it has expired, create a replacement when requested. This flow does not produce a downloadable MP4 or confirm that a permanent render has completed.

## Failures

Report invalid local JSON, HTTP/API validation errors, malformed responses and timeouts explicitly. A successful HTTP status with `success: false` is a failure. Preserve useful API error details. Do not repeat an unchanged invalid request or claim a preview exists when the response contains no usable URL.
