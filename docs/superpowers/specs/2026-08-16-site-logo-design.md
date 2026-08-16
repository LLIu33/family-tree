# Site logo / brand mark — Design

Date: 2026-08-16  
Status: approved for planning

## Goal

Replace the default Vite favicon and plain text brand with a dedicated **Древо** mark (hybrid: letter «Д» + mini family-graph) plus wordmark in the web UI (nav and login hero).

## Decisions

| Topic | Choice |
|-------|--------|
| Mark concept | Hybrid **2**: serif «Д» + three nodes / edges on the right |
| Colors | Existing CSS tokens: accent `#2c5f4e`, gold `#7a6b2e`, paper-deep `#d5ddd4` / paper `#e6ebe4` |
| Delivery | Hand-authored SVG (no raster, no new npm deps) |
| Nav / login | Icon **+** word «Древо» (lockup) |
| Favicon | Same mark as `favicon.svg` (simplify strokes if needed at 16px) |

## Assets

- `web/public/brand-mark.svg` — canonical mark (viewBox fixed; works on light paper backgrounds).
- `web/public/favicon.svg` — same artwork (or a slightly bolder stroke variant); referenced from `web/index.html` (already `href="/favicon.svg"`).

Optional later (out of scope): PNG apple-touch / OG image.

## UI integration

- Shared React component, e.g. `web/src/components/BrandMark.tsx` (or `BrandLockup`):
  - Inline SVG preferred (crisp, no flash, can use `currentColor` / fixed brand fills matching tokens).
  - Props: `size` (nav ~28–32px; login hero larger), `withWordmark` (default `true`).
- `AppNav`: replace text-only brand `Link` with lockup linking to `/`; `aria-label="Древо — на главную"`; decorative SVG `aria-hidden`.
- `LoginPage`: keep hero brand hierarchy; add mark beside/above existing «Древо» heading (do not let the mark overpower the wordmark — brand name stays primary).
- Minimal CSS for gap/alignment of lockup; reuse `.brand` / Fraunces for the word.

## Out of scope

- Full visual redesign of the app
- Changing product name
- Marketing landing beyond existing login
- Separate dark-mode mark variants (app is light paper theme)

## Documentation

- Brief note in `docs/user/overview.md` and/or a short line in `docs/dev/` UI docs if present.
- Check off **Логотип сайта** in `docs/ROADMAP.md`.

## Success criteria

1. Favicon in the browser tab shows the new mark (not Vite purple).
2. Nav and login show mark + «Древо».
3. Mark matches hybrid-2 composition and site palette.
4. Docs + ROADMAP updated in the same change set.
5. Web lint/build pass; no new dependencies.
