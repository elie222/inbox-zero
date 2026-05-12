"use strict";

module.exports = {
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

    "@types/node",
  ],
};
