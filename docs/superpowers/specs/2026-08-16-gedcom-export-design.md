# GEDCOM export (round-trip subset via gedcom-typescript)

**Date:** 2026-08-16  
**Status:** Approved for planning  
**Roadmap:** Now → «Экспорт дерева в `.ged`»

## Problem

The app can import GEDCOM 5.5 / 5.5.1 into a user’s tree, but cannot export a `.ged` for backup or transfer. Roadmap lists GEDCOM export as a Now product item (and as the minimum path toward Backup / restore in Next).

## Goals

- Authenticated download of the current user’s tree as a `.ged` file.
- Field coverage matching what import stores (INDI + FAM subset), without media.
- Use `gedcom-typescript` (`writeGedcom`) for serialization (GEDCOM 5.5.5 writer).
- Export control on the existing `/import` page.

## Non-goals

- Media / `OBJE` / avatar export.
- Sources, repositories, submitter records beyond a minimal HEAD.
- Replacing the custom import parser with the library.
- Multi-tree selection (JWT still implies 1 user → 1 tree).
- Standalone “Backup” product flow (can reuse this endpoint later).

## Design

### 1. Dependency

- Add npm package `gedcom-typescript` (approved).
- Use `writeGedcom` to serialize a constructed `GedcomFile`.
- Do not switch import to this library in this change.

### 2. API

```http
GET /family-tree/export/gedcom
Authorization: Bearer <jwt>
```

- Guard: existing JWT auth; scope = `CurrentUser.treeId`.
- Success: `200`, body = GEDCOM text.
  - `Content-Type: text/plain; charset=utf-8`
  - `Content-Disposition: attachment; filename="family-tree.ged"`
- Empty tree: still `200` with a valid minimal file (header + trailer via the library), not an error.
- No tree id in the path/query (trust JWT only).

### 3. Service

`GedcomExportService` in the family-tree module:

1. Load all `Individual` and `Family` nodes for `treeId`, plus `HUSBAND` / `WIFE` / `CHILD` relationships.
2. Map Neo4j entities → `gedcom-typescript` structures (`GedcomFile` individuals + families maps).
3. Call `writeGedcom(file)` and return the string.

Controller wires the route next to the existing import endpoint and streams/returns the string with download headers.

### 4. Field mapping

**Xrefs**

- Prefer `gedcomId`, else `id`.
- Emit as GEDCOM xrefs (`@I…@` / `@F…@`); sanitize characters illegal in xrefs.

**Individual → INDI** (parity with import-supported tags)

| App field | GEDCOM |
|-----------|--------|
| first/middle/last, namePrefix | `NAME`, `GIVN`, `SURN`, `NPFX` as supported by the library model |
| marriedName | Prefer `_MARNM` via library unknown/extension tags if available; if the writer cannot emit `_MARNM`, append a short `NOTE` `Married name: …` so the value is not dropped |
| sex | `SEX` |
| birthDate / birthPlace | `BIRT` / `DATE` / `PLAC` |
| deathDate / deathPlace / deathCause | `DEAT` / `DATE` / `PLAC` / `CAUS` |
| burialPlace | `BURI` / `PLAC` |
| occupation | `OCCU` |
| retirementNote | `RETI` / note as library allows |
| email | `EMAIL` / address attribute as library allows |
| biography | `NOTE` |
| extraEvents | best-effort structured `EVEN` if parseable; else a single `NOTE` line |

**Family → FAM**

| App field | GEDCOM |
|-----------|--------|
| husband / wife / children | `HUSB`, `WIFE`, `CHIL` |
| marriageDate | `MARR` / `DATE` |
| divorceDate | `DIV` / `DATE` |
| marriagePlace | `MARR` / `PLAC` when present |

**Dates:** format as English GEDCOM dates (`D MON YYYY`) compatible with the existing import normalizer.

**Out of export:** `Media`, avatar URLs, separate Neo4j `Event` nodes when Individual properties already hold BIRT/DEAT.

### 5. Web UI

- `ImportPage`: secondary action «Скачать .ged» beside import.
- `api.exportGedcom()`: authenticated GET, blob download as `family-tree.ged`.
- Surface API errors similarly to import.

### 6. Testing

- Unit: one individual + one family with marriage and child → serialized string contains expected name/sex/family links/dates.
- Unit: empty tree → non-throwing minimal GEDCOM.
- Optional: `writeGedcom` output parses with `readGedcom` without fatal structure loss for the fixture.
- `npm run build` / `npm test` / lint for touched backend code.

### 7. Docs

- Mark ROADMAP Now checkbox for GEDCOM export when shipped.
- No separate user guide required beyond existing import page copy update.

## Error handling

- Unauthenticated → existing 401 behavior.
- Neo4j / unexpected mapping errors → 500 with existing filter style; do not leak internal IDs beyond normal logging.
- Very large trees: v1 loads full tree in memory (same scale assumptions as `getFullGraph`); no streaming serializer unless proven necessary later.

## Implementation order

1. Add dependency; spike `writeGedcom` with a tiny in-memory fixture.
2. `GedcomExportService` + mapper + Jest tests.
3. Controller endpoint + headers.
4. Web `exportGedcom` + ImportPage button.
5. ROADMAP checkbox.

## Open follow-ups (out of scope)

- Media / GEDZIP.
- Dedicated Backup UX.
- Strict GEDCOM 5.5.1 version string if consumers reject 5.5.5 HEAD (can adjust header meta later).
