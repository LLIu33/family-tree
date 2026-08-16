# Документация Family Tree

Практические Markdown-страницы по продукту, разработке и деплою. Пользовательские сценарии — в `user/`, технические детали — в `dev/`.

## Навигация

### Общее

- [Roadmap](ROADMAP.md) — запланированные и выполненные задачи
- [Деплой демо](deploy/DEMO.md) — развёртывание публичного демо

### Пользовательская документация (`user/`)

- [Обзор продукта](user/overview.md) — возможности, экраны, роли
- [Шаринг дерева](user/sharing.md) — приглашения, роли, переключение деревьев
- [Импорт и экспорт](user/import-export.md) — GEDCOM из UI

### Документация для разработчиков (`dev/`)

- [Архитектура](dev/architecture.md) — Nest, Neo4j, web, `treeId`
- [CI](dev/ci.md) — GitHub Actions, coverage, локальные команды
- [Аутентификация](dev/auth.md) — register/login/me, JWT, switch
- [Модель графа](dev/graph-model.md) — Individual, Family, связи
- [API](dev/api.md) — группы маршрутов и роли
- [GEDCOM](dev/gedcom.md) — поддерживаемое подмножество, экспорт
- [Media / S3](dev/media-s3.md) — загрузка, аватары, env
