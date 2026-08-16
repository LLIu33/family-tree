# Аутентификация и сессия дерева

Роли дерева: `owner`, `editor`, `viewer` (`TreeRole`). Иерархия: owner > editor > viewer.

## Эндпоинты Auth

| Метод | Путь | Доступ | Назначение |
|-------|------|--------|------------|
| `POST` | `/auth/register` | публичный | Пользователь + личное дерево (`OWNS`), JWT владельца |
| `POST` | `/auth/login` | публичный | JWT для **личного** дерева (`OWNS`) |
| `GET` | `/auth/me` | JWT | Профиль активной сессии |

Тело register: `email`, `password` (6–72), `name`; опционально `treeName` (иначе `Древо: {name}`).

Ответ register/login: `{ accessToken, user }`. `user`: `userId`, `email`, `name`, `treeId`, `treeName`, `role`.

`GET /auth/me` возвращает тот же `user`. `JwtStrategy` берёт `sub` и `treeId` из токена и заново считает роль по графу. Если доступа к `treeId` из JWT нет — профиль личного дерева (`OWNS`).

## JWT payload

```
{ sub, email, treeId, role }
```

- `sub` — id пользователя  
- `treeId` — активное дерево  
- `role` — роль **на момент выдачи** токена  

Срок: `JWT_EXPIRES_IN` (по умолчанию `7d`). Смена дерева — новый токен (`POST /trees/:treeId/switch` или accept invite).

`MinRoleGuard` не доверяет только claim `role`: проверяет эффективную роль в Neo4j для `user.treeId`.

## Деревья и переключение

| Метод | Путь | Назначение |
|-------|------|------------|
| `GET` | `/trees` | Деревья с `OWNS` или `MEMBER_OF` |
| `POST` | `/trees/:treeId/switch` | Новая сессия, если роль ≥ `viewer` |

`POST /auth/login` всегда открывает личное дерево владельца, не последнее shared. Чтобы вернуться к shared-дереву, нужен switch (в UI — селектор в шапке).

Приглашения и участники — только `owner`: см. [api.md](api.md) и [user/sharing.md](../user/sharing.md).

## Веб: boot через `/auth/me`

`ProtectedRoute` при наличии токена вызывает `GET /auth/me` (`refreshSessionUser`) и обновляет локального пользователя, если изменились `treeId` / `role` / `treeName`. 401/403 — логаут. Без токена — редирект на `/login`.
