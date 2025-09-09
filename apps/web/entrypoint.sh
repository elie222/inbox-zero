#!/bin/bash

pnpm install
pnpm prisma migrate dev
pnpm run dev 