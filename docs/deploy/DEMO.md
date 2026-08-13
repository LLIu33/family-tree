# Демо-деплой: Render + Aura Free и Oracle Always Free

| Файл | Зачем |
|------|--------|
| `Dockerfile` | API + web (Oracle / VPS) |
| `Dockerfile.api` | lean API для Render Free |
| `docker-compose.prod.yml` | Neo4j + API на VM |
| `render.yaml` | Render Blueprint |

API — только REST (GraphQL удалён).

## Render + Aura

1. Aura Free → URI / user / password  
2. Render Blueprint → этот репо  
3. API: **Environment = Docker**, **Dockerfile Path = `Dockerfile.api`**  
   Не выбирай Node — иначе Render делает `npm start` / `nest start` и падает по OOM.  
4. Env API: `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `STORAGE_TYPE=local`, `SERVE_WEB=false`  
   Удали `NODE_OPTIONS`, если добавлял. Start Command оставь пустым (берётся из Dockerfile).  
5. Web static: Root Directory = `web`, `VITE_API_URL=<api url>`  
6. Проверка: `GET /health`

## Oracle

`docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`

## Render Node (один сервис API+UI)

Если открываешь `https://….onrender.com/` и видишь `Cannot GET /` — это только API.
Нужно собрать фронт в `public/` и включить раздачу:

1. **Build Command:** `npm ci && npm run build:render`  
   (для web same-origin не задавай `VITE_API_URL`, или поставь пустым)
2. **Start Command:** `node --max-old-space-size=460 --optimize-for-size dist/main.js`
3. Env: **`SERVE_WEB=true`**, плюс Aura `NEO4J_*`, `STORAGE_TYPE=local`, `SWAGGER_ENABLED=false`
4. Redeploy → `/` должен открыть UI, `/health` — API

Альтернатива: отдельный Static Site с Root `web` и `VITE_API_URL=<api url>`.

- Используй `Dockerfile.api` + Clear build cache & deploy  
- Если снова OOM → instance ≥1 GB или Oracle
