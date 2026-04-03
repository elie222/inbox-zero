import { describe, expect, it } from "vitest";
import { seedLlmPlaceholderCredentials } from "./llm";
import { buildVercelEnvValues } from "./setup-vercel";

describe("buildVercelEnvValues", () => {
  it("seeds required placeholders and target-specific base urls", () => {
    const llmEnv = {
      DEFAULT_LLM_PROVIDER: "openai",
      DEFAULT_LLM_MODEL: "gpt-5.4-mini",
      ECONOMY_LLM_PROVIDER: "openai",
      ECONOMY_LLM_MODEL: "gpt-5.4-nano",
      LLM_API_KEY: "replace-me",
    };

    const values = buildVercelEnvValues({
      baseUrl: "https://example.vercel.app",
      llmEnv,
    });

    expect(
      values.find(
        (value) =>
          value.key === "GOOGLE_CLIENT_ID" &&
          value.environment === "production",
      ),
    ).toMatchObject({
      value: "skipped",
      sensitive: false,
    });

    expect(
      values.find(
        (value) =>
          value.key === "GOOGLE_PUBSUB_TOPIC_NAME" &&
          value.environment === "preview",
      ),
    ).toMatchObject({
      value: "projects/your-project-id/topics/inbox-zero-emails",
    });

    expect(
      values.find(
        (value) =>
          value.key === "NEXT_PUBLIC_BASE_URL" &&
          value.environment === "production",
      ),
    ).toMatchObject({
      value: "https://example.vercel.app",
    });

    expect(
      values.find(
        (value) =>
          value.key === "NEXT_PUBLIC_BASE_URL" &&
          value.environment === "development",
      ),
    ).toMatchObject({
      value: "http://localhost:3000",
    });
  });

  it("marks generated secrets as sensitive and includes optional microsoft envs", () => {
    const llmEnv = {
      DEFAULT_LLM_PROVIDER: "openai",
      DEFAULT_LLM_MODEL: "gpt-5.4-mini",
      ECONOMY_LLM_PROVIDER: "openai",
      ECONOMY_LLM_MODEL: "gpt-5.4-nano",
      LLM_API_KEY: "replace-me",
    };

    const values = buildVercelEnvValues({
      baseUrl: "https://mail.example.com",
      google: {
        clientId: "google-id",
        clientSecret: "google-secret",
        pubsubTopicName: "projects/demo/topics/inbox-zero",
      },
      llmEnv,
      microsoft: {
        clientId: "microsoft-id",
        clientSecret: "microsoft-secret",
        tenantId: "common",
      },
    });

    expect(
      values.find(
        (value) =>
          value.key === "AUTH_SECRET" && value.environment === "production",
      ),
    ).toMatchObject({
      createValue: expect.any(Function),
      sensitive: true,
    });

    expect(
      values.find(
        (value) =>
          value.key === "MICROSOFT_CLIENT_SECRET" &&
          value.environment === "preview",
      ),
    ).toMatchObject({
      value: "microsoft-secret",
      sensitive: true,
    });

    expect(
      values.find(
        (value) =>
          value.key === "MICROSOFT_WEBHOOK_CLIENT_STATE" &&
          value.environment === "development",
      ),
    ).toMatchObject({
      createValue: expect.any(Function),
      sensitive: true,
    });
  });
});

describe("seedLlmPlaceholderCredentials", () => {
  it("fills bedrock placeholder credentials with defaults", () => {
    const env = { DEFAULT_LLM_PROVIDER: "bedrock" };

    seedLlmPlaceholderCredentials("bedrock", env);

    expect(env).toMatchObject({
      DEFAULT_LLM_MODEL: "global.anthropic.claude-sonnet-4-6",
      ECONOMY_LLM_PROVIDER: "bedrock",
      ECONOMY_LLM_MODEL: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
      BEDROCK_ACCESS_KEY: "replace-me",
      BEDROCK_SECRET_KEY: "replace-me",
      BEDROCK_REGION: "us-west-2",
    });
  });
});
