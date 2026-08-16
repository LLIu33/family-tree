# Tree Avatars, Spouse Blocks & Surname Dim — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tree avatars slightly larger, keep spouses as rigid side-by-side blocks in layout, and add a surname filter that dims everyone else.

**Architecture:** Keep the custom SVG/`foreignObject` canvas. Strengthen `layoutNodes` so packing works on spouse *blocks* (not individuals). Add pure highlight helpers for surname+focus dim rules. Wire a surname `<select>` into the existing `TreeCanvas` toolbar and reuse `.is-dim` / `.is-hot`.

**Tech Stack:** React 19 + Vite (web), TypeScript, existing CSS. Tests for pure helpers via Node built-in `node:test` run with `npx tsx --test` (no permanent new dependency in `package.json` unless the user approves vitest later).

**Spec:** `docs/superpowers/specs/2026-08-16-tree-avatars-spouses-surname-design.md`

## Global Constraints

- Approach 1 only: no family-unit layout rewrite, no graph-lib migration, no backend changes.
- Avatar: `sm` → `md` only; keep `CARD_W`/`CARD_H` unless a tiny CSS tweak is required.
- Surname mode: dim non-matches; never hide nodes.
- Do not add npm dependencies without asking the user first.
- Commits only when the user explicitly asks (skip commit steps during execution unless told otherwise).
- Follow existing NestJS/web project style; no drive-by refactors.

---

## File structure

| File | Responsibility |
|------|----------------|
| `web/src/components/TreeCanvas.tsx` | Avatar size; surname select state; dim/hot class composition |
| `web/src/components/TreeCanvas.css` | Optional card padding tweak; surname select styling in toolbar |
| `web/src/components/treeLayout.ts` | Export spouse-block helpers; pack layers by rigid blocks |
| `web/src/components/treeHighlight.ts` | Pure: normalize surname, collect surnames, node/edge dim flags |
| `web/src/components/treeLayout.spouses.test.ts` | `node:test` coverage for spouse ordering + packing |
| `web/src/components/treeHighlight.test.ts` | `node:test` coverage for surname/focus rules |

---

### Task 1: Larger tree avatars

**Files:**
- Modify: `web/src/components/TreeCanvas.tsx` (PersonAvatar `size` prop)
- Modify (only if needed): `web/src/components/TreeCanvas.css` (padding/gap)

**Interfaces:**
- Consumes: existing `PersonAvatar` sizes `"sm" | "md"`
- Produces: tree nodes render `md` avatars (~2.75rem)

- [ ] **Step 1: Change avatar size in TreeCanvas**

In `web/src/components/TreeCanvas.tsx`, find:

```tsx
<PersonAvatar person={n} size="sm" />
```

Replace with:

```tsx
<PersonAvatar person={n} size="md" />
```

- [ ] **Step 2: Visual fit check (CSS only if clipped)**

Run: `npm run build --prefix web`  
Expected: build succeeds.

Open the tree in the app. If the larger avatar clips years/name inside the 200×108 card, reduce `.tree-node` padding slightly, e.g.:

```css
.tree-node {
  padding: 0.45rem 0.6rem;
  gap: 0.5rem;
}
```

Do **not** change `CARD_W` / `CARD_H` unless text is unreadable after padding tweak.

- [ ] **Step 3: Commit (only if user asked)**

```bash
git add web/src/components/TreeCanvas.tsx web/src/components/TreeCanvas.css
git commit -m "$(cat <<'EOF'
feat(web): use medium avatars on tree nodes

EOF
)"
```

---

### Task 2: Spouse-block helpers + failing tests

**Files:**
- Create: `web/src/components/treeLayout.spouses.test.ts`
- Modify: `web/src/components/treeLayout.ts` (export helpers; implement in Task 3)

**Interfaces:**
- Consumes: `SPOUSE_GAP`, `CARD_W`, `GAP_X` / unit spacing already in `treeLayout.ts`
- Produces:
  - `export function buildSpouseBlocks(ids: string[], spousesOf: Map<string, string[]>): string[][]`
  - `export function orderIdsWithSpouseBlocks(ids: string[], spousesOf: Map<string, string[]>): string[]`
  - `export function packBlocks(blocks: string[][], xHint: Map<string, number>, spousesOf: Map<string, string[]>): Map<string, number>`

Semantics:

- `buildSpouseBlocks`: partition `ids` into connected components of the undirected spouse graph (only edges where both endpoints are in `ids`). Preserve stable order: blocks ordered by the minimum index of any member in the original `ids` list; within a block, order members by first appearance in `ids`, then append remaining spouses in discovery order so the block stays contiguous.
- `orderIdsWithSpouseBlocks`: flatten `buildSpouseBlocks(...)`.
- `packBlocks`: for each block compute `hint = average of xHint for members (or PAD)`; sort blocks by hint; place each block left→right: first member at `max(PAD, cursor, hint - blockWidth/2)` clamped so the whole block fits without overlapping previous; members inside a block use `CARD_W + SPOUSE_GAP` between consecutive spouses and `CARD_W + GAP_X` only between non-spouse adjacent people (within a true spouse component all consecutive pairs should be spouses or chained so use spouse gap between consecutive placed members of the same block). Return new `Map` of id→x (left edge of card).

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/treeLayout.spouses.test.ts`:

```ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CARD_W,
  SPOUSE_GAP,
  buildSpouseBlocks,
  orderIdsWithSpouseBlocks,
  packBlocks,
} from './treeLayout.ts'

function spouses(pairs: Array<[string, string]>): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const [a, b] of pairs) {
    if (!m.has(a)) m.set(a, [])
    if (!m.has(b)) m.set(b, [])
    if (!m.get(a)!.includes(b)) m.get(a)!.push(b)
    if (!m.get(b)!.includes(a)) m.get(b)!.push(a)
  }
  return m
}

describe('buildSpouseBlocks', () => {
  it('keeps a married pair in one contiguous block even if listed apart', () => {
    const sp = spouses([['h', 'w']])
    const blocks = buildSpouseBlocks(['h', 'x', 'w'], sp)
    assert.deepEqual(blocks, [['h', 'w'], ['x']])
  })

  it('chains multiple spouses of one person into one block', () => {
    const sp = spouses([
      ['a', 'b'],
      ['a', 'c'],
    ])
    const blocks = buildSpouseBlocks(['b', 'z', 'a', 'c'], sp)
    assert.equal(blocks.length, 2)
    assert.deepEqual(new Set(blocks[0]), new Set(['a', 'b', 'c']))
    assert.deepEqual(blocks[1], ['z'])
    const flat = orderIdsWithSpouseBlocks(['b', 'z', 'a', 'c'], sp)
    const iA = flat.indexOf('a')
    const iB = flat.indexOf('b')
    const iC = flat.indexOf('c')
    const iZ = flat.indexOf('z')
    assert.ok(Math.max(iA, iB, iC) - Math.min(iA, iB, iC) === 2)
    assert.ok(iZ === 0 || iZ === 3)
  })
})

describe('packBlocks', () => {
  it('places spouses with SPOUSE_GAP and does not insert a gap between them', () => {
    const sp = spouses([['h', 'w']])
    const blocks = buildSpouseBlocks(['h', 'w'], sp)
    const xHint = new Map([
      ['h', 100],
      ['w', 800],
    ])
    const xPos = packBlocks(blocks, xHint, sp)
    const gap = Math.abs(xPos.get('w')! - xPos.get('h')!)
    assert.equal(gap, CARD_W + SPOUSE_GAP)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run:

```bash
cd web && npx --yes tsx --test src/components/treeLayout.spouses.test.ts
```

Expected: FAIL (exports missing / not implemented).

- [ ] **Step 3: Commit test file only (only if user asked)**

```bash
git add web/src/components/treeLayout.spouses.test.ts
git commit -m "$(cat <<'EOF'
test(web): add spouse block layout cases

EOF
)"
```

---

### Task 3: Implement spouse blocks inside `layoutNodes`

**Files:**
- Modify: `web/src/components/treeLayout.ts`

**Interfaces:**
- Consumes: helpers from Task 2
- Produces: `layoutNodes` uses block packing so spouses in the same generation stay adjacent after X assignment

- [ ] **Step 1: Implement exported helpers in `treeLayout.ts`**

Add near the top (after `minStep`):

```ts
/** Connected spouse components within `ids`, stable by first appearance. */
export function buildSpouseBlocks(
  ids: string[],
  spousesOf: Map<string, string[]>,
): string[][] {
  const inGen = new Set(ids)
  const index = new Map(ids.map((id, i) => [id, i]))
  const visited = new Set<string>()
  const blocks: string[][] = []

  for (const id of ids) {
    if (visited.has(id)) continue
    const block: string[] = []
    const queue = [id]
    visited.add(id)
    while (queue.length) {
      const cur = queue.shift()!
      block.push(cur)
      for (const s of spousesOf.get(cur) ?? []) {
        if (!inGen.has(s) || visited.has(s)) continue
        visited.add(s)
        queue.push(s)
      }
    }
    block.sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0))
    blocks.push(block)
  }

  blocks.sort(
    (a, b) =>
      Math.min(...a.map((id) => index.get(id) ?? 0)) -
      Math.min(...b.map((id) => index.get(id) ?? 0)),
  )
  return blocks
}

export function orderIdsWithSpouseBlocks(
  ids: string[],
  spousesOf: Map<string, string[]>,
): string[] {
  return buildSpouseBlocks(ids, spousesOf).flat()
}

export function packBlocks(
  blocks: string[][],
  xHint: Map<string, number>,
  spousesOf: Map<string, string[]>,
): Map<string, number> {
  const scored = blocks.map((block) => {
    const hints = block.map((id) => xHint.get(id)).filter((x): x is number => x != null)
    const hint =
      hints.length === 0
        ? PAD
        : hints.reduce((s, x) => s + x, 0) / hints.length
    return { block, hint }
  })
  scored.sort((a, b) => a.hint - b.hint || a.block[0].localeCompare(b.block[0]))

  const xPos = new Map<string, number>()
  let cursor = PAD
  let prevId: string | null = null

  for (const { block, hint } of scored) {
    const widths: number[] = []
    for (let i = 0; i < block.length; i++) {
      if (i === 0) widths.push(0)
      else widths.push(minStep(block[i - 1], block[i], spousesOf))
    }
    const span = widths.reduce((s, w) => s + w, 0)
    let start = Math.max(cursor, hint - span / 2)
    if (prevId != null) {
      start = Math.max(start, cursor + minStep(prevId, block[0], spousesOf))
    } else {
      start = Math.max(PAD, start)
    }
    let x = start
    for (let i = 0; i < block.length; i++) {
      if (i > 0) x += minStep(block[i - 1], block[i], spousesOf)
      xPos.set(block[i], x)
    }
    cursor = x
    prevId = block[block.length - 1]
  }
  return xPos
}
```

- [ ] **Step 2: Wire helpers into `layoutNodes`**

Replace the existing spouse-adjacency loop (the `for (const g of gens)` that builds `next` with spouses) with:

```ts
for (const g of gens) {
  const ids = orderIdsWithSpouseBlocks(byGen.get(g)!, spousesOf)
  byGen.set(g, ids)
  ids.forEach((id, i) => order.set(id, i))
}
```

Replace `packLayer` so it packs by blocks:

```ts
const packLayer = (ids: string[]): string[] => {
  const blocks = buildSpouseBlocks(ids, spousesOf)
  const packed = packBlocks(blocks, xPos, spousesOf)
  for (const [id, x] of packed) xPos.set(id, x)
  return blocks.flat()
}
```

Keep `placeByRefs` writing per-node hints into `xPos`, but ensure its final line still calls `packLayer(ids)` so hints that try to pull spouses apart are collapsed by `packBlocks`.

Optionally simplify the inner placement loop later; not required if `packLayer` runs last per generation.

- [ ] **Step 3: Run spouse tests — expect PASS**

```bash
cd web && npx --yes tsx --test src/components/treeLayout.spouses.test.ts
```

Expected: all tests PASS.

- [ ] **Step 4: Typecheck / build web**

```bash
npm run build --prefix web
```

Expected: success.

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add web/src/components/treeLayout.ts web/src/components/treeLayout.spouses.test.ts
git commit -m "$(cat <<'EOF'
fix(web): keep spouses in rigid layout blocks

EOF
)"
```

---

### Task 4: Surname/focus highlight helpers + tests

**Files:**
- Create: `web/src/components/treeHighlight.ts`
- Create: `web/src/components/treeHighlight.test.ts`

**Interfaces:**
- Consumes: `IndividualNode`-like `{ id, lastName?: string }`
- Produces:
  - `normalizeSurname(value: string | undefined | null): string`
  - `collectSurnames(nodes: Array<{ lastName?: string }>): string[]`
  - `isSurnameMismatch(lastName: string | undefined, selected: string | null): boolean`
  - `nodeHighlightFlags(args: { surnameMismatch: boolean; focusActive: boolean; inRelated: boolean }): { isDim: boolean; isHot: boolean }`
  - `edgeIsHot(sourceEmphasized: boolean, targetEmphasized: boolean, dimActive: boolean): boolean`

Rules (from spec):

- `normalizeSurname`: trim + lower case; empty → `''`.
- `collectSurnames`: unique by normalized key; skip `''` and normalized `'unknown'`; display string = first-seen original trimmed spelling; sort by localized compare of display strings.
- `isSurnameMismatch`: `selected` non-null/non-empty AND normalize(lastName) !== normalize(selected).
- `isDim` = `surnameMismatch || (focusActive && !inRelated)`.
- `isHot` = `!surnameMismatch && focusActive && inRelated`.
- `edgeIsHot`: if `!dimActive` → true (caller may skip dim classes); else `sourceEmphasized && targetEmphasized` where emphasized means the node would not be dim.

- [ ] **Step 1: Write failing tests**

Create `web/src/components/treeHighlight.test.ts`:

```ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectSurnames,
  isSurnameMismatch,
  nodeHighlightFlags,
  normalizeSurname,
} from './treeHighlight.ts'

describe('normalizeSurname', () => {
  it('trims and lowercases', () => {
    assert.equal(normalizeSurname('  Иванов '), 'иванов')
  })
})

describe('collectSurnames', () => {
  it('dedupes case-insensitively and skips blank/unknown', () => {
    assert.deepEqual(
      collectSurnames([
        { lastName: 'Иванов' },
        { lastName: 'иванов' },
        { lastName: ' ' },
        { lastName: 'unknown' },
        { lastName: 'Петров' },
      ]),
      ['Иванов', 'Петров'],
    )
  })
})

describe('nodeHighlightFlags', () => {
  it('keeps other surnames dim even when in focus related set', () => {
    const flags = nodeHighlightFlags({
      surnameMismatch: true,
      focusActive: true,
      inRelated: true,
    })
    assert.equal(flags.isDim, true)
    assert.equal(flags.isHot, false)
  })

  it('hots matching surname nodes that are in focus related set', () => {
    const flags = nodeHighlightFlags({
      surnameMismatch: false,
      focusActive: true,
      inRelated: true,
    })
    assert.equal(flags.isDim, false)
    assert.equal(flags.isHot, true)
  })

  it('dims non-related when focus is active and surname matches', () => {
    const flags = nodeHighlightFlags({
      surnameMismatch: false,
      focusActive: true,
      inRelated: false,
    })
    assert.equal(flags.isDim, true)
    assert.equal(flags.isHot, false)
  })
})

describe('isSurnameMismatch', () => {
  it('is false when filter cleared', () => {
    assert.equal(isSurnameMismatch('Иванов', null), false)
  })
  it('is true for other surnames when filter set', () => {
    assert.equal(isSurnameMismatch('Петров', 'Иванов'), true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd web && npx --yes tsx --test src/components/treeHighlight.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement `treeHighlight.ts`**

```ts
export function normalizeSurname(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase()
}

export function collectSurnames(
  nodes: Array<{ lastName?: string }>,
): string[] {
  const byKey = new Map<string, string>()
  for (const n of nodes) {
    const display = (n.lastName ?? '').trim()
    const key = normalizeSurname(display)
    if (!key || key === 'unknown') continue
    if (!byKey.has(key)) byKey.set(key, display)
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'ru'))
}

export function isSurnameMismatch(
  lastName: string | undefined,
  selected: string | null,
): boolean {
  if (!selected || !normalizeSurname(selected)) return false
  return normalizeSurname(lastName) !== normalizeSurname(selected)
}

export function nodeHighlightFlags(args: {
  surnameMismatch: boolean
  focusActive: boolean
  inRelated: boolean
}): { isDim: boolean; isHot: boolean } {
  const { surnameMismatch, focusActive, inRelated } = args
  const isDim = surnameMismatch || (focusActive && !inRelated)
  const isHot = !surnameMismatch && focusActive && inRelated
  return { isDim, isHot }
}

export function edgeIsHot(
  sourceEmphasized: boolean,
  targetEmphasized: boolean,
  dimActive: boolean,
): boolean {
  if (!dimActive) return true
  return sourceEmphasized && targetEmphasized
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd web && npx --yes tsx --test src/components/treeHighlight.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add web/src/components/treeHighlight.ts web/src/components/treeHighlight.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add surname highlight helpers

EOF
)"
```

---

### Task 5: Wire surname select + dim into TreeCanvas

**Files:**
- Modify: `web/src/components/TreeCanvas.tsx`
- Modify: `web/src/components/TreeCanvas.css`

**Interfaces:**
- Consumes: `collectSurnames`, `isSurnameMismatch`, `nodeHighlightFlags`, `edgeIsHot` from `treeHighlight.ts`
- Produces: toolbar surname filter; nodes/edges use combined dim rules

- [ ] **Step 1: Add state and surname list**

Near other `useState` in `TreeCanvas`:

```tsx
const [surnameFilter, setSurnameFilter] = useState<string | null>(null)
```

```tsx
const surnames = useMemo(() => collectSurnames(nodes), [nodes])
```

Clear invalid selection when the list changes:

```tsx
useEffect(() => {
  if (
    surnameFilter &&
    !surnames.some(
      (s) => normalizeSurname(s) === normalizeSurname(surnameFilter),
    )
  ) {
    setSurnameFilter(null)
  }
}, [surnames, surnameFilter])
```

- [ ] **Step 2: Replace dim computation for nodes**

Remove reliance on `const isDim = dimEdges && !hot.has(n.id)` only.

```tsx
const focusActive = Boolean(focusId)
const dimActive = focusActive || Boolean(surnameFilter)

// inside node map:
const surnameMismatch = isSurnameMismatch(n.lastName, surnameFilter)
const { isDim, isHot } = nodeHighlightFlags({
  surnameMismatch,
  focusActive,
  inRelated: hot.has(n.id),
})
```

Use `isDim` on the node class as today. (Node does not need `is-hot` class today — keep that; edges use hot.)

Build a helper map for edge emphasis:

```tsx
const emphasized = useMemo(() => {
  const set = new Set<string>()
  for (const n of laid) {
    const mismatch = isSurnameMismatch(n.lastName, surnameFilter)
    const { isDim } = nodeHighlightFlags({
      surnameMismatch: mismatch,
      focusActive,
      inRelated: hot.has(n.id),
    })
    if (!isDim) set.add(n.id)
  }
  // When nothing is dimming, treat all as emphasized
  if (!dimActive) {
    for (const n of laid) set.add(n.id)
  }
  return set
}, [laid, surnameFilter, focusActive, hot, dimActive])
```

- [ ] **Step 3: Update edge/comb class logic**

For spouse edges:

```tsx
const isHot = edgeIsHot(
  emphasized.has(rel.source),
  emphasized.has(rel.target),
  dimActive,
)
const classes = [
  'tree-edge',
  'spouse',
  dimActive && !isHot ? 'is-dim' : '',
  dimActive && isHot ? 'is-hot' : '',
]
  .filter(Boolean)
  .join(' ')
```

For family combs:

```tsx
const isHot = edgeIsHot(
  comb.memberIds.some((id) => emphasized.has(id)),
  comb.memberIds.some((id) => emphasized.has(id)),
  dimActive,
)
```

(For combs, hot if **any** member is emphasized — matches prior “some(hot)” behavior while still dimming combs that only touch dimmed people. Prefer: hot when `comb.memberIds.some(id => emphasized.has(id))` if `dimActive`, else always hot.)

Simpler comb rule matching previous code intent:

```tsx
const isHot = !dimActive || comb.memberIds.some((id) => emphasized.has(id))
```

- [ ] **Step 4: Add surname `<select>` to toolbar**

Inside `.tree-toolbar`, after the search form (before zoom), add:

```tsx
<label className="tree-surname">
  <span className="sr-only">Фамилия</span>
  <select
    value={surnameFilter ?? ''}
    onChange={(e) =>
      setSurnameFilter(e.target.value ? e.target.value : null)
    }
  >
    <option value="">Все фамилии</option>
    {surnames.map((s) => (
      <option key={s} value={s}>
        {s}
      </option>
    ))}
  </select>
</label>
```

Also update pointer-down ignore selector if needed so dragging does not start from the select (`.tree-toolbar` already ignored).

- [ ] **Step 5: CSS for the select**

In `TreeCanvas.css`:

```css
.tree-surname select {
  min-width: 9rem;
  max-width: 14rem;
  height: 2.25rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
  padding: 0 0.65rem;
  font: inherit;
}
```

Place it so the toolbar still wraps cleanly on small screens (toolbar already flex-wraps if it does; if not, add `flex-wrap: wrap` on `.tree-toolbar`).

- [ ] **Step 6: Build**

```bash
npm run build --prefix web
```

Expected: success.

- [ ] **Step 7: Manual check**

1. Full tree: avatars look ~md size.
2. Married couple in one generation: cards adjacent (~18px gap).
3. Select a surname: others opacity ~0.42; selecting a person still hot-lights related *matching* people.
4. «Все фамилии» clears dim from surname.

- [ ] **Step 8: Commit (only if user asked)**

```bash
git add web/src/components/TreeCanvas.tsx web/src/components/TreeCanvas.css web/src/components/treeHighlight.ts web/src/components/treeHighlight.test.ts
git commit -m "$(cat <<'EOF'
feat(web): dim tree by selected surname

EOF
)"
```

---

### Task 6: Final verification

**Files:** none new

- [ ] **Step 1: Run all new web helper tests**

```bash
cd web && npx --yes tsx --test src/components/treeLayout.spouses.test.ts src/components/treeHighlight.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Build web**

```bash
npm run build --prefix web
```

Expected: success.

- [ ] **Step 3: Spec checklist**

Confirm against the design doc:

| Spec item | Done via |
|-----------|----------|
| Avatar md | Task 1 |
| Rigid spouse blocks | Tasks 2–3 |
| Surname dim (not hide) | Tasks 4–5 |
| Focus does not undim other surnames | Task 4–5 |
| No backend | — |

---

## Self-review (plan vs spec)

1. **Spec coverage:** Avatars, spouse rigidity, surname dim, focus composition, non-goals (no hide, no backend, no unit rewrite) — all covered; follow-ups left out.
2. **Placeholders:** None intentionally left; comb edge hot rule spelled out in Task 5.
3. **Types:** Helper names consistent across tasks (`buildSpouseBlocks`, `packBlocks`, `nodeHighlightFlags`, `surnameFilter: string | null`).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-16-tree-avatars-spouses-surname.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
