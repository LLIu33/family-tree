# Архитектура

Стек: NestJS API (`src/`), граф Neo4j, веб на Vite + React (`web/`). Локально API и Neo4j поднимаются через Docker Compose; веб — отдельно (`web/`, порт 5173). Публичное демо: [deploy/DEMO.md](../deploy/DEMO.md).

CI: [ci.md](ci.md) — lint, typecheck, test/coverage, build на PR и `main`.

## Компоненты

| Часть | Роль |
|-------|------|
| NestJS | REST (`/auth`, `/trees`, `/invites`, `/family-tree`, `/health`). `API_PREFIX` из `.env` **не** вешается на роуты. |
| Neo4j | Пользователи, деревья, индивиды, семьи, media, события. |
| Vite web | Логин, карта дерева, импорт/экспорт GEDCOM, доступ (приглашения). |
| S3 | Файлы media и аватары. См. [media-s3.md](media-s3.md). |

Swagger: `/api-docs`, если `SWAGGER_ENABLED=true`.

## Тенантность: одно активное дерево на JWT

При `POST /auth/register` создаются `User` и личное `Tree`, связь `(User)-[:OWNS]->(Tree)`. Доступ к чужому дереву — `(User)-[:MEMBER_OF {role}]->(Tree)` после приглашения.

Активное дерево — поля JWT `treeId` и `role` (см. [auth.md](auth.md)). CRUD и граф читают/пишут только узлы с этим `treeId`.

Свойство `treeId` есть у `Individual`, `Family`, `Media` и `Event`. Отдельного REST для `Event` нет: узлы появляются при импорте GEDCOM (рождение/смерть).

`OWNS` всегда даёт роль `owner`. `MEMBER_OF.role` — только `editor` или `viewer`. Если есть и владение, и членство, эффективная роль — `owner`.

## Авторизация на API

- Публично: `POST /auth/register`, `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /health`.
- `POST /auth/login`, `/auth/register`, `/auth/forgot-password` и `/auth/reset-password` ограничены по IP (см. [auth.md](auth.md)).
- Остальное — `Authorization: Bearer <JWT>`.
- Мутации family-tree/media: `editor` или `owner`. Чтение: `viewer+`. Админ приглашений и участников: только `owner`.

Подробнее: [auth.md](auth.md), [api.md](api.md).
