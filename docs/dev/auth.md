# Аутентификация и сессия дерева

Роли дерева: `owner`, `editor`, `viewer` (`TreeRole`). Иерархия: owner > editor > viewer.

## Эндпоинты Auth

| Метод | Путь | Доступ | Назначение |
|-------|------|--------|------------|
| `POST` | `/auth/register` | публичный | Пользователь + личное дерево (`OWNS`), JWT владельца; дубликат email → `409` |
| `POST` | `/auth/login` | публичный | JWT для **личного** дерева (`OWNS`) |
| `POST` | `/auth/forgot-password` | публичный | Запрос ссылки сброса пароля (anti-enumeration) |
| `POST` | `/auth/reset-password` | публичный | Новый пароль по одноразовому токену |
| `GET` | `/auth/me` | JWT | Профиль активной сессии |

## Rate limiting

`POST /auth/login`, `/auth/register`, `/auth/forgot-password`, and `/auth/reset-password` are rate-limited **per client IP** (in-memory; resets on process restart). Defaults:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/login` | 5 | 60s |
| `POST /auth/register` | 3 | 60s |
| `POST /auth/forgot-password` | 3 | 60s |
| `POST /auth/reset-password` | 5 | 60s |

Env: `AUTH_THROTTLE_TTL` (ms), `AUTH_THROTTLE_LIMIT_LOGIN`, `AUTH_THROTTLE_LIMIT_REGISTER`, `AUTH_THROTTLE_LIMIT_FORGOT`, `AUTH_THROTTLE_LIMIT_RESET`.

Exceeding the limit → `429 Too Many Requests`. Other routes are not covered by these auth throttlers.

Behind a reverse proxy, the API uses Express `trust proxy` so the client IP is taken from the proxy headers.

## Auth hardening notes

- Login failures always use `Invalid email or password` (unknown email still runs a dummy bcrypt compare).
- Duplicate register → `409` with `Unable to register with the provided email` (dummy bcrypt hash first).

Тело register: `email`, `password` (6–72), `name`; опционально `treeName` (иначе `Древо: {name}`).

## Сброс пароля

Логика в `PasswordResetService`. Почта через порт `MailSender`; по умолчанию `LogMailSender` (`MAIL_DRIVER=log`) — URL пишется в лог API, SMTP не нужен.

### `POST /auth/forgot-password`

Тело: `{ email }`. Всегда HTTP 200 и одно сообщение (anti-enumeration), даже если email не найден:

`If an account exists for this email, a reset link has been sent.`

Если пользователь есть: создаётся узел `PasswordReset`, письмо с `{APP_PUBLIC_URL}/reset-password?token={raw}`. Если нет — timing pad, без записи в Neo4j и без mail.

### `POST /auth/reset-password`

Тело: `{ token, password }` (пароль 6–72, как при register). Успех:

`Password updated. You can sign in.`

JWT после сброса не выдаётся — клиент ведёт на `/login`. Невалидный/просроченный токен → `400` `Invalid or expired reset token`.

### Neo4j: `PasswordReset`

```
(:PasswordReset {
  id, tokenHash,   // SHA-256(raw token), raw не хранится
  expiresAt, createdAt
})-[:FOR_USER]->(:User)
```

Сырой токен: 32 байта `base64url`. TTL: `PASSWORD_RESET_TTL_MS` (по умолчанию `3600000`, 1 ч). После успешного reset — `DETACH DELETE` всех `PasswordReset` пользователя; у `User` обновляются `passwordHash` и `passwordChangedAt`.

### Env (mail / reset)

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `APP_PUBLIC_URL` | `http://localhost:5173` | База ссылки в письме (без trailing `/`) |
| `MAIL_DRIVER` | `log` | Драйвер почты (сейчас только `log`) |
| `PASSWORD_RESET_TTL_MS` | `3600000` | Срок жизни токена сброса |

Ответ register/login: `{ accessToken, user }`. `user`: `userId`, `email`, `name`, `treeId`, `treeName`, `role`.

`GET /auth/me` возвращает тот же `user`. `JwtStrategy` берёт `sub` и `treeId` из токена и заново считает роль по графу. Если доступа к `treeId` из JWT нет — профиль личного дерева (`OWNS`).

## JWT payload

```
{ sub, email, treeId, role, pwd? }
```

- `sub` — id пользователя  
- `treeId` — активное дерево  
- `role` — роль **на момент выдачи** токена  
- `pwd` — опционально, unix ms `User.passwordChangedAt` на момент выдачи (есть после первого сброса пароля)

Срок: `JWT_EXPIRES_IN` (по умолчанию `7d`). Смена дерева — новый токен (`POST /trees/:treeId/switch` или accept invite).

`JwtStrategy` вызывает `assertJwtPasswordFresh`: если у пользователя задан `passwordChangedAt`, токен без `pwd` или с `pwd < passwordChangedAtMs` → `401 Invalid token`. У пользователей без `passwordChangedAt` (не сбрасывали пароль) старые JWT остаются валидными.

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
