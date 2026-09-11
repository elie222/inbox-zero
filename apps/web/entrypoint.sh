#!/bin/bash

pnpm -w install --filter '!@inboxzero/desktop'
pnpm prisma migrate dev
pnpm run dev
