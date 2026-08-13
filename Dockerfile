# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# Empty → same-origin (Oracle / single-service). Override for Render split builds.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:22-bookworm-slim AS api-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV SERVE_WEB=true
ENV PORT=3000

COPY package.json package-lock.json ./
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/dist ./dist
COPY --from=web-build /web/dist ./public

EXPOSE 3000
CMD ["node", "dist/main.js"]
