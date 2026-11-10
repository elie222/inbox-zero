---
name: i18n
description: How UI strings are translated with Lingui in apps/web - wrapping strings in Client and Server Components, the locale cookie, catalogs, and adding a language. Use when adding or changing user-facing text in a translated area, translating a page group, or touching apps/web/locales.
---

# Translating the UI (Lingui)

The source language is English. Catalogs live in `apps/web/locales/<locale>/messages.po`; `apps/web/lingui.config.ts` lists the locales. Macros compile with `@lingui/swc-plugin` (Next) and `@lingui/vite-plugin` (Vitest), and `.po` files load through `@lingui/loader`, so there is no compile step.

SWC plugins are tied to the `swc_core` version inside Next. If a Next upgrade fails to load `@lingui/swc-plugin`, move the plugin to a release built for that Next version (plugins.swc.rs lists the pairs).

## Where translation works

Only components rendered under `app/(app)/layout.tsx` have a locale: that layout reads the `locale` cookie and wraps the app in `LinguiClientProvider`. Do not wrap strings in components that also render outside it (marketing, login, shared `components/ui`) until that route group gets a provider too, or `useLingui` throws there.

## Wrapping strings

Client Components:

```tsx
import { Trans, useLingui } from "@lingui/react/macro";

const { t } = useLingui();
<ItemTitle><Trans>Dark mode</Trans></ItemTitle>
<Switch aria-label={t`Toggle dark mode`} />
<Trans>Sign in with {data.email}.</Trans>
```

Server Components and `generateMetadata` have no React context. Call `initLingui()` first in every page, layout, or metadata function that renders text, then use `t(i18n)`:

```tsx
import { t } from "@lingui/core/macro";
import { initLingui } from "@/utils/i18n/server";

const i18n = await initLingui();
return <PageHeader title={t(i18n)`Settings`} />;
```

`<Trans>` also works in Server Components after `initLingui()`.

- Module-level constants (option lists, labels) can't call `t` at import time. Define them with `msg` from `@lingui/core/macro` and render with `i18n._(descriptor)` (`const { i18n } = useLingui()`).
- Counts use `plural` / `<Plural>`, never `count === 1 ? ... : ...`.
- Keep whole sentences in one message, with JSX inside `<Trans>`, rather than gluing fragments together.
- Don't translate brand and product names (Slack, Gmail, Inbox Zero), user data, or values the server stores and compares.
- Wrapping a string keeps its English text, so Playwright specs that select by visible name keep working. Don't reword strings while wrapping them.

## Catalogs

Feature PRs add or change strings in code only. Don't run `intl:extract` or edit `messages.po` in them. Every build runs `lingui extract-template` first, so a string missing from the catalogs still renders in English. Run `pnpm -F inbox-zero-ai intl:extract` and fill translations in a separate translation PR, or in a PR that adds a language.

When translating, keep every placeholder (`{0}`, `{name}`), numbered tag (`<0>…</0>`), and plural `#`, match the catalog's existing terms and tone, and keep short labels short. Check that `pnpm -F inbox-zero-ai exec lingui extract` reports 0 missing for the locale.

## Adding a language

Add it to `locales` in `lingui.config.ts`, to `LOCALES` and `LOCALE_LABELS` in `utils/i18n/locales.ts`, and to the catalog imports in `utils/i18n/server.ts`. Then run `intl:extract`, translate the new catalog, and commit it.

## Locale selection

The `locale` cookie, set by the Language setting in Settings, picks the language; without it the app is English. The setting is shown behind the `ui-language` PostHog flag, and to anyone already using another language.
