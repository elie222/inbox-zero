import "@/__tests__/test-env";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock next/server's after() to just run synchronously in tests
vi.mock("next/server", async () => {
  const actual = await vi.importActual("next/server");
  return {
    ...actual,
    after: async (fn: () => void | Promise<void>) => {
      // In tests, just run the function synchronously
      return await fn();
    },
  };
});

// Mock QStash signature verification for tests
vi.mock("@upstash/qstash/nextjs", () => ({
  verifySignatureAppRouter: vi.fn((handler) => handler),
}));

// Translated components need an I18nProvider, which the app layout supplies.
// English with no catalog renders each message's source text.
vi.mock("@testing-library/react", async () => {
  const actual = await vi.importActual<typeof import("@testing-library/react")>(
    "@testing-library/react",
  );
  const { createElement } =
    await vi.importActual<typeof import("react")>("react");
  const { setupI18n } =
    await vi.importActual<typeof import("@lingui/core")>("@lingui/core");
  const { I18nProvider } =
    await vi.importActual<typeof import("@lingui/react")>("@lingui/react");
  const i18n = setupI18n({ locale: "en", messages: { en: {} } });

  function withI18n(
    Wrapper?: React.JSXElementConstructor<{ children: React.ReactNode }>,
  ) {
    return function I18nWrapper({ children }: { children: React.ReactNode }) {
      return createElement(
        I18nProvider,
        { i18n },
        Wrapper ? createElement(Wrapper, null, children) : children,
      );
    };
  }

  return {
    ...actual,
    render: ((ui, options) =>
      actual.render(ui, {
        ...options,
        wrapper: withI18n(options?.wrapper),
      })) as typeof actual.render,
    renderHook: ((callback, options) =>
      actual.renderHook(callback, {
        ...options,
        wrapper: withI18n(options?.wrapper),
      })) as typeof actual.renderHook,
  };
});
