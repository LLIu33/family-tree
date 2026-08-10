#!/bin/sh
set -e

npm config set fetch-retries 10
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000

if [ ! -x node_modules/.bin/nest ]; then
  echo "Installing dependencies into container volume (first start)..."
  npm ci
fi

exec npm run start:dev
