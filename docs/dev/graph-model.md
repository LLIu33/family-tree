# Модель графа

Канонические семейные связи идут **через хаб `Family`**, не ребром человек–человек.

```
(Individual)-[:HUSBAND]->(Family)
(Individual)-[:WIFE]->(Family)
(Individual)-[:CHILD]->(Family)
```

Все `Individual` / `Family` в запросах фильтруются по `treeId` активного JWT.

## Как считаются родственники

| Отношение | Паттерн |
|-----------|---------|
| Родители | `(child)-[:CHILD]->(Family)<-[:HUSBAND\|WIFE]-(parent)` |
| Супруги | `(a)-[:HUSBAND\|WIFE]->(Family)<-[:HUSBAND\|WIFE]-(b)` при `a.id <> b.id` |
| Дети | `(parent)-[:HUSBAND\|WIFE]->(Family)<-[:CHILD]-(child)` |

Пол супруга на ребре: `F` / `FEMALE` → `WIFE`, иначе `HUSBAND`.

`POST /family-tree/relationships` принимает логические типы и **пишет только** `HUSBAND` / `WIFE` / `CHILD`:

- `PARENT` / `CHILD` — родитель–ребёнок через Family  
- `SPOUSE` / `MARRIED` / `PARTNER` — супруги  
- `SIBLING` — общие родители через Family  

Остальные значения enum (`DIVORCED`, `ADOPTED`, …) API отвергает (`400`).

GEDCOM: `HUSB`/`WIFE`/`CHIL` у `FAM` → те же рёбра. См. [gedcom.md](gedcom.md).

## Другие типы (не семья)

| Ребро | Смысл |
|-------|--------|
| `(User)-[:OWNS]->(Tree)` | владелец |
| `(User)-[:MEMBER_OF]->(Tree)` | editor/viewer |
| `(Individual)-[:HAS_MEDIA]->(Media)` | фото/файл |
| `(Individual)-[:HAS_EVENT]->(Event)` | событие (импорт GEDCOM) |

## Не использовать как источник истины

Не опирайтесь на `CHILD_OF`, `SPOUSE`, `FAMILY_MEMBER`, `HAS_MEMBER`. Если в старой базе они есть — очистить и заново импортировать (или мигрировать) **до** навигационных запросов.

Устаревшие узлы с `treeId IS NULL` владелец **пустого** дерева может «забрать» при первом чтении графа (`ensureTreeHasData`). Это миграционный костыль, не контракт API.
