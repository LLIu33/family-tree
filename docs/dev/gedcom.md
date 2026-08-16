# GEDCOM

Импорт и экспорт текущего дерева (`user.treeId`). Подмножество **INDI / FAM**, без multimedia.

## Эндпоинты

| Метод | Путь | MinRole | Заметка |
|-------|------|---------|---------|
| `POST` | `/family-tree/import/gedcom` | editor | multipart, поле `file`; опционально `source` (в UI — `web`) |
| `GET` | `/family-tree/export/gedcom` | viewer | `text/plain; charset=utf-8`, `Content-Disposition: attachment; filename="family-tree.ged"` |

Лимит импорта: **20 MB**. UI: [import-export.md](../user/import-export.md).

## Импорт

Парсер — свой, GEDCOM **5.5 / 5.5.1** (`HEAD/GEDC/VERS`). Другая версия в заголовке — ошибка. Разбираются только записи `INDI` и `FAM` (не `OBJE`, не источники).

**INDI (то, что сохраняется):** `NAME` (`GIVN`, `SURN`, `NPFX`, `_MARNM`), `SEX`, `BIRT`/`DEAT`/`BURI` (`DATE`, `PLAC`, `CAUS`), `OCCU`, `RETI`, `NOTE`, `EVEN`, email из `RESI`/`EMAIL`. Пустая фамилия + `_MARNM` (часто MyHeritage) → `_MARNM` как `lastName`.

**FAM:** `HUSB`, `WIFE`, `CHIL`, даты `MARR`/`DIV`. Рёбра в графе — `HUSBAND` / `WIFE` / `CHILD`.

При импорте для дат рождения/смерти создаются узлы `Event` (`HAS_EVENT`). Media из файла **не** создаётся.

## Экспорт

Писатель `gedcom-typescript` (в HEAD — **5.5.5**). Пустое дерево — валидный минимальный файл, не ошибка.

Покрытие — те же поля, что импорт кладёт в Neo4j. `file.multimedia` всегда пустой: **нет `OBJE` и аватаров**.

`marriedName` уходит как `_MARNM`. После сериализации тег переносится **под `NAME` (уровень 2)**, чтобы round-trip совпал с импортом (импорт читает `_MARNM` как ребёнка `NAME`, не как тег уровня 1).

Это не полный backup продукта: только генеалогический граф, без пользователей, приглашений и S3.
