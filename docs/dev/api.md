# API (группы маршрутов)

Не полный OpenAPI: группы, роли, основные пути. Поля DTO — в Swagger (`/api-docs` при `SWAGGER_ENABLED=true`). Префикс `API_PREFIX` на роуты не применяется.

Авторизация: `Authorization: Bearer <JWT>`, кроме публичных auth и `GET /health`.

## Роли (`MinRole`)

| Минимум | Кто проходит |
|---------|----------------|
| `viewer` | viewer, editor, owner |
| `editor` | editor, owner |
| `owner` | только owner |

Правило для family-tree и media: **чтение — viewer+**, **мутации — editor+**. Список деревьев и switch — любой JWT с доступом к дереву. Приглашения и состав — **только owner** (проверка в сервисе, не декоратор `MinRole`).

## Auth — `/auth`

| Метод | Путь | Роль | Заметка |
|-------|------|------|---------|
| `POST` | `/auth/register` | публичный | личное дерево |
| `POST` | `/auth/login` | публичный | сессия `OWNS` |
| `GET` | `/auth/me` | JWT | профиль |

См. [auth.md](auth.md).

## Trees — `/trees`

Все пути с JWT.

| Метод | Путь | Кто | Заметка |
|-------|------|-----|---------|
| `GET` | `/trees` | любой JWT | доступные деревья |
| `POST` | `/trees/:treeId/switch` | viewer+ на это дерево | новый JWT |
| `POST` | `/trees/:treeId/invites` | owner | тело: `role` (`editor`\|`viewer`), опционально `expiresInDays` (1–90, по умолчанию 14) |
| `GET` | `/trees/:treeId/invites` | owner | активные (не revoked, не expired) |
| `DELETE` | `/trees/:treeId/invites/:inviteId` | owner | revoke |
| `GET` | `/trees/:treeId/members` | owner | владелец + MEMBER_OF |
| `DELETE` | `/trees/:treeId/members/:userId` | owner | нельзя удалить owner |

## Invites — `/invites`

| Метод | Путь | Роль | Заметка |
|-------|------|------|---------|
| `POST` | `/invites/:token/accept` | JWT | `MEMBER_OF` (если ещё нет) + switch |

Токен в URL — сырой (в графе хранится SHA-256). Ответ как у login: `{ accessToken, user }`.

## Family tree — `/family-tree`

Контроллер: `JwtAuthGuard` + `MinRoleGuard`. Данные всегда в `user.treeId`.

| Метод | Путь | MinRole | Заметка |
|-------|------|---------|---------|
| `POST` | `/family-tree/individuals` | editor | создать |
| `GET` | `/family-tree/individuals` | viewer | поиск `?q=&limit=` (default 20) |
| `GET` | `/family-tree/individuals/:id` | viewer | карточка + relatives |
| `PATCH` | `/family-tree/individuals/:id` | editor | обновить |
| `POST` | `/family-tree/individuals/:id/children` | editor | добавить ребёнка |
| `GET` | `/family-tree/individuals/:id/ancestors` | viewer | `?generations=` (default 3) |
| `GET` | `/family-tree/individuals/:id/descendants` | viewer | то же |
| `POST` | `/family-tree/individuals/:id/media` | editor | multipart `file` к человеку |
| `GET` | `/family-tree/graph` | viewer | полная компонента для карты |
| `POST` | `/family-tree/families` | editor | семья |
| `GET` | `/family-tree/families/:id` | viewer | семья с членами |
| `POST` | `/family-tree/relationships` | editor | см. [graph-model.md](graph-model.md) |
| `GET` | `/family-tree/visualize/:rootId` | viewer | подграф `?depth=` (default 3) |
| `POST` | `/family-tree/import/gedcom` | editor | см. [gedcom.md](gedcom.md) |
| `GET` | `/family-tree/export/gedcom` | viewer | файл `.ged` |

## Media — `/family-tree/media`

`MediaController`, префикс **`family-tree/media`**.

| Метод | Путь | MinRole | Заметка |
|-------|------|---------|---------|
| `POST` | `/family-tree/media/upload` | editor | multipart `file` + `CreateMediaDto` (`type`, `attachedToId`, …) |
| `GET` | `/family-tree/media/:individualId` | viewer | список media человека |
| `DELETE` | `/family-tree/media/:mediaId` | editor | удалить узел и объект в S3 |

`GET` и `DELETE` различаются методом: один сегмент — id человека или id media. Альтернативная загрузка: `POST /family-tree/individuals/:id/media`.

S3: [media-s3.md](media-s3.md).

## Прочее

`GET /health` — `{ ok: true }`, без JWT.
