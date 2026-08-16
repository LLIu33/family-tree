# Tree canvas: larger avatars, tighter spouses, surname dim

**Date:** 2026-08-16  
**Status:** Approved for planning  
**Approach:** Targeted fixes on the existing custom SVG/HTML tree canvas (no layout rewrite to family-units, no graph-lib migration)

## Problem

1. When the full tree is zoomed out, person avatars read as too small (`PersonAvatar` `sm` / 2rem on 200×108 cards).
2. Spouses in the same generation often sit far apart horizontally: barycenter/child packing pulls individuals apart even though spouse adjacency and `SPOUSE_GAP` already exist.
3. There is no way to emphasize one surname across the whole tree. Focus dimming exists for hover/selection only.

## Goals

- Slightly larger avatars in the tree without a major card redesign.
- Keep married couples (and multi-spouse chains) as contiguous horizontal blocks that move together under packing.
- Dim non-matching surnames while keeping the full tree structure visible (Ancestry/MyHeritage-style lineage highlight, not hide).

## Non-goals

- Adaptive minimum node size under extreme zoom-out.
- Full “family unit as layout atom” rewrite (deferred; revisit only if spouse blocks still fail on real data).
- Completely hiding non-matching surnames.
- Backend/API changes for surname filter (client-side on loaded graph is enough).

## Design

### 1. Avatars

- In `TreeCanvas`, change tree node avatar from `size="sm"` to `size="md"` (~2.75rem via existing `.avatar--md`).
- Keep `CARD_W` / `CARD_H` (~200×108) unless padding/line-height needs a tiny CSS tweak so names still fit.
- Zoom controls and scale range (`0.35`–`2.25`) unchanged.

### 2. Spouse clustering (layout)

Files: `web/src/components/treeLayout.ts` (primary).

Current behavior already:

- Builds `spousesOf` from `SPOUSE` relationships.
- Tries to place spouses adjacent with tighter `SPOUSE_GAP` (18px vs normal `GAP_X`).
- Draws spouse edges and family combs.

Required strengthening:

1. After generation ordering, **force contiguous spouse blocks** in each generation (no non-spouse between members of the same married chain).
2. During horizontal packing / child-anchored placement, treat a spouse block as a **rigid unit**: shift the whole block’s X, never open a gap that separates spouses to satisfy a child’s preferred X alone.
3. Multiple spouses of one person form a single chain (A–B–C) with spouse gaps between consecutive partners; no holes.
4. Visual edge/comb style unchanged; only coordinates change.

Success criterion: for typical nuclear families in one generation, husband and wife sit next to each other with ~`SPOUSE_GAP`; children hang from the family comb without permanently splitting the pair.

### 3. Surname dimming (UI)

Files: `TreeCanvas.tsx`, `TreeCanvas.css` (reuse `.is-dim` / `.is-hot`).

- Toolbar control: surname select built from unique non-empty `lastName` values in the current graph (trim, case-insensitive match for filtering; display original spelling of first seen / sorted uniquely).
- Option «Все» clears the filter.
- Node class rules (explicit):
  - `surnameMismatch` = filter active AND normalized `lastName` ≠ selected surname.
  - `focusActive` = hover or selection focus id is set; `inRelated` = existing `relatedIds()` set.
  - `.is-dim` when `surnameMismatch` OR (`focusActive` AND NOT `inRelated`).
  - `.is-hot` when NOT `surnameMismatch` AND `focusActive` AND `inRelated`.
  - Non-matching surnames never get `.is-hot` (focus does not undim them).
- Edges: apply the same dim/hot logic as today, but treat an endpoint as “emphasized” only if that node would not be `.is-dim` under the rules above (so spouse/parent edges into other surnames stay dim when a surname filter is on).
- No graph reload; filter is pure client state.

### 4. Architecture / data flow

```
TreePage → TreeCanvas(nodes, relationships, …)
              ├─ layoutNodes()           // stronger spouse blocks
              ├─ surname filter state    // local UI
              └─ is-dim / is-hot         // surnameMismatch OR focus rules above
```

No NestJS/Neo4j changes.

### 5. Error handling / edge cases

- Empty / missing / `"unknown"` last names: treated as non-matching when a real surname is selected; do not list `"unknown"` as a filter option unless it appears as a real distinct value users care about — prefer omitting blank/unknown from the select.
- People with no `SPOUSE` link cannot be clustered as spouses (data prerequisite).
- Very large unique-surname lists: plain `<select>` is fine for v1.

### 6. Testing

- Layout unit tests (or focused pure-function tests) for spouse block contiguity and rigid shift under packing, using small synthetic graphs (couple + children; multi-spouse chain).
- Manual check on full tree: avatars readable at default zoom; surname dim; focus still usable.

## Implementation order

1. Avatar `md` (+ minor CSS if needed).
2. Spouse block rigidity in `treeLayout.ts` + tests.
3. Surname select + dim composition in `TreeCanvas`.

## Open follow-ups (out of scope)

- If spouses still split on production data → consider family-unit layout (Approach 2 from brainstorming).
- Optional “hide non-matching” mode later.
