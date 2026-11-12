import { msg } from "@lingui/core/macro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initLingui } from "@/utils/i18n/server";

const { cookieValue } = vi.hoisted(() => ({
  cookieValue: { current: undefined as string | undefined },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "locale" && cookieValue.current
        ? { name, value: cookieValue.current }
        : undefined,
  }),
}));

describe("initLingui", () => {
  beforeEach(() => {
    cookieValue.current = undefined;
  });

  it("renders the language saved in the locale cookie", async () => {
    cookieValue.current = "es";

    const i18n = await initLingui();

    expect(i18n.locale).toBe("es");
    expect(i18n._(msg`Settings`)).toBe("Configuración");
  });

  it("falls back to English without a saved language", async () => {
    const i18n = await initLingui();

    expect(i18n.locale).toBe("en");
    expect(i18n._(msg`Settings`)).toBe("Settings");
  });

  it("falls back to English for a language the app does not offer", async () => {
    cookieValue.current = "xx";

    const i18n = await initLingui();

    expect(i18n.locale).toBe("en");
    expect(i18n._(msg`Settings`)).toBe("Settings");
  });
});
