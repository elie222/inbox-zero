/**
 * Side-effect import. `@/env` validates on module evaluation, so these defaults
 * have to be in place before anything that transitively imports product code is
 * evaluated — a function call in a module body is already too late. Vitest gets
 * this via setupFiles; standalone eval scripts get it by importing this first.
 */
setEnvDefault("NODE_ENV", "test");
setEnvDefault(
  "DATABASE_URL",
  "postgresql://postgres:password@localhost:5432/inboxzero",
);
setEnvDefault("GOOGLE_CLIENT_ID", "test-google-client-id");
setEnvDefault("GOOGLE_CLIENT_SECRET", "test-google-client-secret");
setEnvDefault("GOOGLE_PUBSUB_TOPIC_NAME", "projects/test/topics/inbox-zero");
setEnvDefault("GOOGLE_PUBSUB_VERIFICATION_TOKEN", "test-google-webhook-token");
setEnvDefault("AUTH_SECRET", "test-auth-secret");
setEnvDefault("EMAIL_ENCRYPT_SECRET", "test-email-encrypt-secret");
setEnvDefault("EMAIL_ENCRYPT_SALT", "test-email-encrypt-salt");
setEnvDefault("INTERNAL_API_KEY", "test-internal-api-key");
setEnvDefault("DEFAULT_LLMS", "openrouter:openai/gpt-5.4-mini");
setEnvDefault("NEXT_PUBLIC_BASE_URL", "http://localhost:3000");

function setEnvDefault(key: string, value: string) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
