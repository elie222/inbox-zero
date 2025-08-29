#!/bin/bash

if [ "$NODE_ENV" = "production" ]; then
  echo "Running in production mode..."
  pnpm --filter inbox-zero-ai exec -- prisma migrate deploy
  pnpm --filter inbox-zero-ai start
else
  echo "Running in development mode..."
  pnpm install
  pnpm prisma migrate dev
  pnpm run dev
fi

