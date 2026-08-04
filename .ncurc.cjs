"use strict";

module.exports = {
  peer: true,
  reject: [
    // >=27.4.0 has ESM/CJS incompatibility that breaks Vercel runtime
    "jsdom",

    // Staying on Tailwind v3 — v4 has significant breaking changes
    "tailwindcss",
    "@tailwindcss/forms",
    "@tailwindcss/typography",
    "@headlessui/tailwindcss",
    "tailwind-merge",
    "tailwindcss-animate",
    "postcss",
    "autoprefixer",

    // Major upgrades have heavy breaking changes
    "@tiptap/extension-mention",
    "@tiptap/extension-placeholder",
    "@tiptap/pm",
    "@tiptap/react",
    "@tiptap/starter-kit",
    "@tiptap/suggestion",
    "tiptap-markdown",
    "react-resizable-panels",
    "recharts",
    "@chronark/zod-bird",

    // v9+ breaks the shadcn/ui date picker component
    "react-day-picker",

    // v4 has breaking changes with Tinybird and other integrations
    "zod",

    // v5 imports zod/v4/core; keep this pinned while the app stays on Zod 3
    "@hookform/resolvers",

    // 0.71.6+ pulls in jsonpath, which calls fs.readFileSync(require.resolve(...))
    // at module eval and breaks Turbopack production builds with EBADF.
    // See https://github.com/dubinc/dub-ts/issues/301
    "dub",

    // Keep the chat SDK family aligned with the Slack WebClient version to avoid
    // bypassing Slack integration test API mocks.
    "chat",
    "@chat-adapter/slack",
    "@chat-adapter/state-ioredis",
    "@chat-adapter/state-memory",
    "@chat-adapter/teams",
    "@chat-adapter/telegram",
    "@slack/web-api",

    // Vite 8/Rolldown breaks TSX parsing in Vitest.
    "vite",

    // Keep aligned with BullMQ's ioredis dependency to avoid protected type
    // mismatches when passing Redis connections into queues.
    "ioredis",

    // AI SDK v7-only provider lines; app remains on ai@6 / zod@3
    "@openrouter/ai-sdk-provider",
    "ollama-ai-provider-v2",

    // TypeScript 7 is the native Go compiler without the classic Compiler API;
    // stay on 6 until the monorepo tooling ecosystem is ready.
    "typescript",

    // @slack/web-api@7 depends on @slack/types ^2
    "@slack/types",

    "@types/node",

    // Ultracite 7.10+/Biome 2.5.6 enable mass useSortedKeys failures across the repo.
    // Stay pinned until a dedicated formatting migration.
    "ultracite",
    "@biomejs/biome",
  ],
};
