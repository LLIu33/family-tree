# GEDCOM Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated users download their tree as a `.ged` file (import-parity fields, no media) via `gedcom-typescript`, with a button on `/import`.

**Architecture:** Pure mapper builds a `GedcomFile` from Neo4j-shaped individuals/families; `GedcomExportService` loads the tree and calls `writeGedcom`; Nest controller returns an attachment; web `ImportPage` triggers download. Import parser stays unchanged.

**Tech Stack:** NestJS, Jest, Neo4j (existing), `gedcom-typescript` `0.1.0`, React/Vite web client.

**Spec:** `docs/superpowers/specs/2026-08-16-gedcom-export-design.md`

## Global Constraints

- Dependency allowed: `gedcom-typescript` only (no other new packages without asking).
- Export subset = import-supported INDI/FAM fields; **no** Media/`OBJE`.
- Scope by JWT `treeId` only — no tree id in URL.
- Empty tree → `200` with valid minimal `.ged`, not an error.
- UI: export button on `/import` only.
- Follow existing Nest patterns (services, Jest `*.spec.ts`, no `console.log`, no `any` where avoidable).
- Commits only when the user explicitly asks (skip commit steps unless told).
- Ask before changing architecture patterns beyond this plan.

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/modules/family-tree/services/gedcom-export.mapper.ts` | Pure: app entities → `GedcomFile` + xref helpers + date formatting |
| `src/modules/family-tree/services/gedcom-export.mapper.spec.ts` | Mapper unit tests |
| `src/modules/family-tree/services/gedcom-export.service.ts` | Load Neo4j data for `treeId`, map, `writeGedcom` |
| `src/modules/family-tree/services/gedcom-export.service.spec.ts` | Service tests with mocked Neo4j |
| `src/modules/family-tree/controllers/family-tree.controller.ts` | `GET export/gedcom` |
| `src/modules/family-tree/family-tree.module.ts` | Register `GedcomExportService` |
| `web/src/api.ts` | `exportGedcom()` download helper |
| `web/src/pages/ImportPage.tsx` (+ `.css` if needed) | «Скачать .ged» button |
| `docs/ROADMAP.md` | Check off export item |

---

### Task 1: Install `gedcom-typescript` and confirm writer API

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create (scratch notes OK in report only): none required in repo beyond install

**Interfaces:**
- Consumes: npm registry
- Produces: `import { writeGedcom, readGedcom } from 'gedcom-typescript'` available to the app; implementer records the minimal `GedcomFile` / `Header` shape needed for an empty file

- [ ] **Step 1: Install dependency**

```bash
npm install gedcom-typescript@0.1.0
```

- [ ] **Step 2: Spike empty write in Node REPL or a throwaway script**

Confirm this pattern (adjust property names to match installed `.d.ts` if they differ slightly from README):

```ts
import { writeGedcom, readGedcom } from 'gedcom-typescript'

const empty = readGedcom(`0 HEAD
1 GEDC
2 VERS 5.5.5
1 CHAR UTF-8
0 TRLR
`)
const out = writeGedcom(empty)
if (!out.includes('0 HEAD') || !out.includes('0 TRLR')) {
  throw new Error('unexpected empty write output')
}
```

If constructing a `GedcomFile` by hand is cleaner than `readGedcom` seed, prefer hand-built empty maps + header — document the chosen seed approach in the task report for Task 2.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: pass (or only pre-existing unrelated errors — do not leave new errors).

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore: add gedcom-typescript for GEDCOM export

EOF
)"
```

---

### Task 2: Pure mapper + failing/passing tests (TDD)

**Files:**
- Create: `src/modules/family-tree/services/gedcom-export.mapper.ts`
- Create: `src/modules/family-tree/services/gedcom-export.mapper.spec.ts`

**Interfaces:**
- Consumes: `Individual` / `Family` entity shapes from `../entities`; `writeGedcom` / types from `gedcom-typescript`
- Produces:
  - `export function toGedcomXref(rawId: string, kind: 'I' | 'F'): string`
  - `export function formatGedcomDate(value: Date | string | undefined | null): import('gedcom-typescript').GedcomDate | undefined` (or return exact-date object the writer expects)
  - `export function buildGedcomFile(input: { individuals: Individual[]; families: Family[] }): import('gedcom-typescript').GedcomFile`
  - Prefer `gedcomId` over `id` for xref base; wrap as `@I…@` / `@F…@`; replace illegal xref chars with `_`

Mapping rules (from spec):

- INDI: names (`given`/`surname`/`prefix`), `sex`, `birth`/`death`/`burial`, `occupation`, retirement, email, biography → notes, `marriedName` → `extensions` `{ tag: '_MARNM', value }` **or** note fallback if extensions unsupported by writer, `extraEvents` → note line if not structured
- FAM: `husband`/`wife`/`children` → husband/wife/children xrefs; `marriage`/`divorce` dates (+ marriage place)
- Set `familiesAsChild` / `familiesAsSpouse` on individuals when family membership is known
- Leave sources/multimedia maps empty

- [ ] **Step 1: Write failing tests**

Create `gedcom-export.mapper.spec.ts`:

```ts
import { writeGedcom, readGedcom } from 'gedcom-typescript'
import { Sex } from '../enums/sex.enum'
import { Individual } from '../entities/individual.entity'
import { Family } from '../entities/family.entity'
import { buildGedcomFile, toGedcomXref } from './gedcom-export.mapper'

describe('gedcom-export.mapper', () => {
  it('toGedcomXref wraps and sanitizes', () => {
    expect(toGedcomXref('I1', 'I')).toBe('@I1@')
    expect(toGedcomXref('@I1@', 'I')).toBe('@I1@')
    expect(toGedcomXref('bad id!', 'F')).toMatch(/^@F/)
  })

  it('exports a couple with child and round-trips via writeGedcom/readGedcom', () => {
    const husband = Object.assign(new Individual(), {
      id: 'h1',
      gedcomId: 'I-H',
      firstName: 'James',
      lastName: 'Potter',
      sex: Sex.MALE,
      birthDate: new Date(Date.UTC(1960, 2, 27)),
    })
    const wife = Object.assign(new Individual(), {
      id: 'w1',
      gedcomId: 'I-W',
      firstName: 'Lily',
      lastName: 'Evans',
      sex: Sex.FEMALE,
      marriedName: 'Potter',
    })
    const child = Object.assign(new Individual(), {
      id: 'c1',
      gedcomId: 'I-C',
      firstName: 'Harry',
      lastName: 'Potter',
      sex: Sex.MALE,
      birthDate: new Date(Date.UTC(1980, 6, 31)),
      biography: 'The boy who lived',
    })
    const family = Object.assign(new Family(), {
      id: 'f1',
      gedcomId: 'F1',
      husband,
      wife,
      children: [child],
      marriageDate: '1978-10-31',
    })

    const file = buildGedcomFile({
      individuals: [husband, wife, child],
      families: [family],
    })
    const text = writeGedcom(file)

    expect(text).toMatch(/0 @I-H@ INDI|0 @IH@ INDI|James/)
    expect(text).toContain('Harry')
    expect(text).toMatch(/1 HUSB|HUSB/)
    expect(text).toMatch(/1 WIFE|WIFE/)
    expect(text).toMatch(/1 CHIL|CHIL/)
    expect(text).toMatch(/MARR/)
    expect(text).toMatch(/_MARNM|Married name/)

    const parsed = readGedcom(text)
    expect(parsed.individuals.size).toBeGreaterThanOrEqual(3)
    expect(parsed.families.size).toBeGreaterThanOrEqual(1)
  })

  it('builds a minimal file for an empty tree', () => {
    const text = writeGedcom(buildGedcomFile({ individuals: [], families: [] }))
    expect(text).toContain('0 HEAD')
    expect(text).toContain('0 TRLR')
  })
})
```

Tighten assertions after the Task 1 spike once real xref sanitization behavior is known (keep semantic checks: 3 people, 1 family, marriage, married name preserved somehow).

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest src/modules/family-tree/services/gedcom-export.mapper.spec.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement mapper**

Implement `gedcom-export.mapper.ts` so tests pass. Suggested structure:

```ts
import { writeGedcom, /* types */ } from 'gedcom-typescript'
// Prefer constructing GedcomFile manually; seed header from Task 1 spike.

export function toGedcomXref(rawId: string, kind: 'I' | 'F'): string {
  let core = (rawId || '').trim()
  if (core.startsWith('@') && core.endsWith('@') && core.length > 2) {
    core = core.slice(1, -1)
  }
  core = core.replace(/[^A-Za-z0-9_\-]/g, '_')
  if (!core.startsWith(kind)) core = `${kind}${core}`
  return `@${core}@`
}

export function buildGedcomFile(input: {
  individuals: Individual[]
  families: Family[]
}): GedcomFile {
  // 1) create empty GedcomFile (header CHAR UTF-8, GEDC 5.5.5)
  // 2) map individuals into individuals Map
  // 3) map families; wire FAMS/FAMC links on individuals
  // 4) return file (caller runs writeGedcom)
}
```

Date helper: if value is `Date`, emit `{ type: 'exact', date: { day, month: 'MON', year } }` with English month abbreviations. If string already looks like `31 JUL 1980`, parse lightly or use `type: 'phrase'`.

Sex: map `Sex.MALE`/`FEMALE`/`UNKNOWN` → `'M'|'F'|'U'`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest src/modules/family-tree/services/gedcom-export.mapper.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/modules/family-tree/services/gedcom-export.mapper.ts src/modules/family-tree/services/gedcom-export.mapper.spec.ts
git commit -m "$(cat <<'EOF'
feat: map family tree entities to GEDCOM file model

EOF
)"
```

---

### Task 3: `GedcomExportService` (Neo4j load + write)

**Files:**
- Create: `src/modules/family-tree/services/gedcom-export.service.ts`
- Create: `src/modules/family-tree/services/gedcom-export.service.spec.ts`
- Modify: `src/modules/family-tree/family-tree.module.ts`

**Interfaces:**
- Consumes: `Neo4jService`, `buildGedcomFile`, `writeGedcom`
- Produces: `GedcomExportService.exportTree(treeId: string): Promise<string>`

Load query (single read is fine):

```cypher
MATCH (i:Individual {treeId: $treeId})
RETURN i
ORDER BY i.lastName, i.firstName, i.id
```

```cypher
MATCH (f:Family)
WHERE f.treeId = $treeId OR f.treeId IS NULL
OPTIONAL MATCH (h:Individual {treeId: $treeId})-[:HUSBAND]->(f)
OPTIONAL MATCH (w:Individual {treeId: $treeId})-[:WIFE]->(f)
OPTIONAL MATCH (c:Individual {treeId: $treeId})-[:CHILD]->(f)
RETURN f, h AS husband, w AS wife, collect(DISTINCT c) AS children
```

Filter families to those that touch at least one individual of this tree (or `f.treeId = $treeId`) so legacy null `treeId` families without members are skipped.

Normalize with existing `Neo4jResultUtils` / `Individual.fromNeo4j` patterns used in `FamilyTreeService.getFamily`.

- [ ] **Step 1: Write failing service test**

```ts
import { GedcomExportService } from './gedcom-export.service'
import { Neo4jService } from '../../../neo4j/neo4j.service'

describe('GedcomExportService', () => {
  it('returns HEAD/TRLR for empty tree', async () => {
    const neo4j = {
      read: jest
        .fn()
        .mockResolvedValueOnce({ records: [] }) // individuals
        .mockResolvedValueOnce({ records: [] }), // families
    }
    const service = new GedcomExportService(neo4j as unknown as Neo4jService)
    const text = await service.exportTree('tree-1')
    expect(text).toContain('0 HEAD')
    expect(text).toContain('0 TRLR')
    expect(neo4j.read).toHaveBeenCalled()
  })
})
```

Add a second test with one mocked individual record if easy (optional but preferred).

- [ ] **Step 2: Run — expect FAIL**

```bash
npx jest src/modules/family-tree/services/gedcom-export.service.spec.ts
```

- [ ] **Step 3: Implement service + register in module**

```ts
@Injectable()
export class GedcomExportService {
  constructor(private readonly neo4jService: Neo4jService) {}

  async exportTree(treeId: string): Promise<string> {
    const individuals = await this.loadIndividuals(treeId)
    const families = await this.loadFamilies(treeId)
    return writeGedcom(buildGedcomFile({ individuals, families }))
  }
}
```

In `family-tree.module.ts` add `GedcomExportService` to `providers`.

- [ ] **Step 4: Run tests — PASS**

```bash
npx jest src/modules/family-tree/services/gedcom-export.mapper.spec.ts src/modules/family-tree/services/gedcom-export.service.spec.ts
```

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/modules/family-tree/services/gedcom-export.service.ts src/modules/family-tree/services/gedcom-export.service.spec.ts src/modules/family-tree/family-tree.module.ts
git commit -m "$(cat <<'EOF'
feat: export family tree to GEDCOM via Neo4j load

EOF
)"
```

---

### Task 4: HTTP endpoint

**Files:**
- Modify: `src/modules/family-tree/controllers/family-tree.controller.ts`

**Interfaces:**
- Consumes: `GedcomExportService.exportTree`
- Produces: `GET /family-tree/export/gedcom`

- [ ] **Step 1: Add controller method**

Inject `GedcomExportService`. Add (near import endpoint):

```ts
@Get('export/gedcom')
@ApiOperation({ summary: 'Export family tree as GEDCOM' })
@ApiResponse({ status: 200, description: 'GEDCOM file' })
async exportGedcom(
  @CurrentUser() user: AuthUser,
  @Res({ passthrough: true }) res: Response,
): Promise<string> {
  const text = await this.gedcomExportService.exportTree(user.treeId)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="family-tree.ged"',
  )
  return text
}
```

Import Nest `Res` and Express `Response` as elsewhere in the codebase (or use `@Header` decorators if the project prefers that — match existing style; if no prior `@Res`, prefer:

```ts
@Header('Content-Type', 'text/plain; charset=utf-8')
@Header('Content-Disposition', 'attachment; filename="family-tree.ged"')
@Get('export/gedcom')
async exportGedcom(@CurrentUser() user: AuthUser): Promise<string> {
  return this.gedcomExportService.exportTree(user.treeId)
}
```

- [ ] **Step 2: Build / lint**

```bash
npm run build
npm run lint
```

Expected: pass for touched code.

- [ ] **Step 3: Commit (only if user asked)**

```bash
git add src/modules/family-tree/controllers/family-tree.controller.ts
git commit -m "$(cat <<'EOF'
feat: add GET /family-tree/export/gedcom endpoint

EOF
)"
```

---

### Task 5: Web download on Import page

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/pages/ImportPage.tsx`
- Modify: `web/src/pages/ImportPage.css` (minimal layout for export block)

**Interfaces:**
- Consumes: `GET /family-tree/export/gedcom` with Bearer token
- Produces: `exportGedcom(): Promise<void>` that triggers browser download

- [ ] **Step 1: Add API helper**

In `web/src/api.ts`:

```ts
export async function exportGedcom(
  filename = 'family-tree.ged',
): Promise<void> {
  const token = getToken()
  const res = await fetch(`${API_URL}/family-tree/export/gedcom`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).catch(() => {
    throw new ApiError(0, `Не удалось связаться с API (${API_URL}).`)
  })
  if (!res.ok) {
    const message = (await res.text().catch(() => '')) || res.statusText
    throw new ApiError(res.status, message || 'Экспорт не удался')
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
```

(Do not force JSON Content-Type on this GET.)

- [ ] **Step 2: Wire ImportPage**

Below the import form, add:

```tsx
<section className="import-panel panel export-panel">
  <h2 className="export-title">Экспорт</h2>
  <p className="muted">Скачайте текущее древо как файл GEDCOM (.ged).</p>
  {exportError && <p className="error">{exportError}</p>}
  <button
    className="btn btn-ghost"
    type="button"
    disabled={exportPending}
    onClick={async () => {
      setExportError(null)
      setExportPending(true)
      try {
        await exportGedcom()
      } catch (err) {
        setExportError(
          err instanceof ApiError ? err.message : 'Экспорт не удался',
        )
      } finally {
        setExportPending(false)
      }
    }}
  >
    {exportPending ? 'Готовим файл…' : 'Скачать .ged'}
  </button>
</section>
```

Add local state `exportPending` / `exportError`. Keep page title brand hierarchy; export is a secondary section (one job).

- [ ] **Step 3: Minimal CSS**

```css
.export-panel {
  margin-top: 1.25rem;
}
.export-title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  margin: 0 0 0.35rem;
}
```

- [ ] **Step 4: Build web**

```bash
npm run build --prefix web
```

Expected: success.

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add web/src/api.ts web/src/pages/ImportPage.tsx web/src/pages/ImportPage.css
git commit -m "$(cat <<'EOF'
feat(web): download GEDCOM export from import page

EOF
)"
```

---

### Task 6: Roadmap checkbox + final verification

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Mark Now item done**

Change:

```md
- [ ] **Экспорт дерева в `.ged`** — GEDCOM export (импорт уже есть; также как backup)
```

to:

```md
- [x] **Экспорт дерева в `.ged`** — GEDCOM export (импорт уже есть; также как backup)
```

- [ ] **Step 2: Run full verification**

```bash
npx jest src/modules/family-tree/services/gedcom-export.mapper.spec.ts src/modules/family-tree/services/gedcom-export.service.spec.ts
npm run build
npm run lint
npm run build --prefix web
```

Expected: all pass.

- [ ] **Step 3: Spec checklist**

| Spec item | Task |
|-----------|------|
| `gedcom-typescript` + write | 1–2 |
| `GET /family-tree/export/gedcom` | 4 |
| JWT tree scope | 3–4 |
| Empty tree OK | 2–3 |
| Import-page button | 5 |
| No media | — |
| ROADMAP checked | 6 |

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add docs/ROADMAP.md
git commit -m "$(cat <<'EOF'
docs: mark GEDCOM export done in roadmap

EOF
)"
```

---

## Self-review (plan vs spec)

1. **Spec coverage:** API, library, mapper parity fields, empty tree, UI on `/import`, tests, roadmap — covered. Media explicitly excluded.
2. **Placeholders:** None intentional; Task 1 spike may adjust exact `GedcomFile` construction — Task 2 owns the final shape.
3. **Types:** `exportTree(treeId: string): Promise<string>`, `buildGedcomFile(...)`, `exportGedcom()` on web — consistent across tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-16-gedcom-export.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session with checkpoints  

Which approach?
