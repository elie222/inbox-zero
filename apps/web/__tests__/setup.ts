import { vi } from "vitest";

setRequiredTestEnv();

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

function setRequiredTestEnv() {
  setEnvDefault("NODE_ENV", "test");
  setEnvDefault(
    "DATABASE_URL",
    "postgresql://postgres:password@localhost:5432/inboxzero",
  );
  setEnvDefault("GOOGLE_CLIENT_ID", "test-google-client-id");
  setEnvDefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret");
  setEnvDefault("GOOGLE_PUBSUB_TOPIC_NAME", "projects/test/topics/inbox-zero");
  setEnvDefault("EMAIL_ENCRYPT_SECRET", "test-email-encrypt-secret");
  setEnvDefault("EMAIL_ENCRYPT_SALT", "test-email-encrypt-salt");
  setEnvDefault("INTERNAL_API_KEY", "test-internal-api-key");
  setEnvDefault("DEFAULT_LLM_PROVIDER", "openai");
  setEnvDefault("NEXT_PUBLIC_BASE_URL", "http://localhost:3000");
}

function setEnvDefault(key: string, value: string) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
