import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test_db",
      GOOGLE_CLIENT_ID: "test_google_client_id",
      GOOGLE_CLIENT_SECRET: "test_google_client_secret",
      EMAIL_ENCRYPT_SECRET: "test_encrypt_secret_32_chars_long",
      EMAIL_ENCRYPT_SALT: "test_encrypt_salt_16_chars",
      GOOGLE_PUBSUB_TOPIC_NAME: "test_topic",
      INTERNAL_API_KEY: "test_internal_api_key_32_chars_long",
      NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    },
  },
});
