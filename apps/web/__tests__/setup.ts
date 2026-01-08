import { vi } from "vitest";

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
