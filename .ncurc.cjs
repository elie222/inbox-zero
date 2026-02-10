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

    // v9+ breaks the shadcn/ui date picker component
    "react-day-picker",

    // v4 has breaking changes with Tinybird and other integrations
    "zod",
  ],
};
