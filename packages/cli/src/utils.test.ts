import { describe, it, expect } from "vitest";
import {
  generateSecret,
  generateEnvFile,
  isSensitiveKey,
  parseEnvFile,
  parsePortConflict,
  updateEnvValue,
  redactValue,
  type EnvConfig,
} from "./utils";

describe("generateSecret", () => {
  it("should generate a hex string of correct length", () => {
    const secret16 = generateSecret(16);
    const secret32 = generateSecret(32);

    // Hex encoding doubles the byte length
    expect(secret16).toHaveLength(32);
    expect(secret32).toHaveLength(64);
  });

  it("should generate valid hex strings", () => {
    const secret = generateSecret(16);
    expect(secret).toMatch(/^[0-9a-f]+$/);
  });

  it("should generate unique secrets", () => {
    const secrets = new Set<string>();
    for (let i = 0; i < 100; i++) {
      secrets.add(generateSecret(16));
    }
    expect(secrets.size).toBe(100);
  });
});

describe("generateEnvFile", () => {
  const baseTemplate = `# Test template
DATABASE_URL=placeholder
UPSTASH_REDIS_URL=placeholder
AUTH_SECRET=
GOOGLE_CLIENT_ID=
MICROSOFT_CLIENT_ID=
DEFAULT_LLM_PROVIDER=
DEFAULT_LLM_MODEL=
ANTHROPIC_API_KEY=
`;

  const baseEnv: EnvConfig = {
    DATABASE_URL: "postgresql://user:pass@db:5432/test",
    UPSTASH_REDIS_URL: "http://redis:80",
    UPSTASH_REDIS_TOKEN: "token123",
    AUTH_SECRET: "secret123",
    GOOGLE_CLIENT_ID: "google-id",
    GOOGLE_CLIENT_SECRET: "google-secret",
    MICROSOFT_CLIENT_ID: "microsoft-id",
    MICROSOFT_CLIENT_SECRET: "microsoft-secret",
    DEFAULT_LLM_PROVIDER: "anthropic",
    DEFAULT_LLM_MODEL: "claude-sonnet-4-5-20250929",
    ECONOMY_LLM_PROVIDER: "anthropic",
    ECONOMY_LLM_MODEL: "claude-haiku-4-5-20251001",
    ANTHROPIC_API_KEY: "sk-ant-xxx",
  };

  it("should replace existing values in template", () => {
    const result = generateEnvFile({
      env: baseEnv,
      useDockerInfra: false,
      llmProvider: "anthropic",
      template: baseTemplate,
    });

    expect(result).toContain(
      'DATABASE_URL="postgresql://user:pass@db:5432/test"',
    );
    expect(result).toContain("AUTH_SECRET=secret123");
    expect(result).toContain("GOOGLE_CLIENT_ID=google-id");
  });

  it("should set Docker-specific values when useDockerInfra is true", () => {
    const dockerEnv: EnvConfig = {
      ...baseEnv,
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: "mypassword",
      POSTGRES_DB: "inboxzero",
    };

    const templateWithPostgres = `${baseTemplate}
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=
`;

    const result = generateEnvFile({
      env: dockerEnv,
      useDockerInfra: true,
      llmProvider: "anthropic",
      template: templateWithPostgres,
    });

    expect(result).toContain("POSTGRES_USER=postgres");
    expect(result).toContain("POSTGRES_PASSWORD=mypassword");
    expect(result).toContain("POSTGRES_DB=inboxzero");
  });

  it("should set LLM provider API key", () => {
    const result = generateEnvFile({
      env: baseEnv,
      useDockerInfra: false,
      llmProvider: "anthropic",
      template: baseTemplate,
    });

    expect(result).toContain("ANTHROPIC_API_KEY=sk-ant-xxx");
    expect(result).toContain("DEFAULT_LLM_PROVIDER=anthropic");
  });

  it("should handle OpenAI provider", () => {
    const openaiEnv: EnvConfig = {
      ...baseEnv,
      DEFAULT_LLM_PROVIDER: "openai",
      DEFAULT_LLM_MODEL: "gpt-4.1",
      OPENAI_API_KEY: "sk-openai-xxx",
    };

    const templateWithOpenai = `${baseTemplate}
OPENAI_API_KEY=
`;

    const result = generateEnvFile({
      env: openaiEnv,
      useDockerInfra: false,
      llmProvider: "openai",
      template: templateWithOpenai,
    });

    expect(result).toContain("OPENAI_API_KEY=sk-openai-xxx");
    expect(result).toContain("DEFAULT_LLM_PROVIDER=openai");
  });

  it("should handle Bedrock provider with multiple keys", () => {
    const bedrockEnv: EnvConfig = {
      ...baseEnv,
      DEFAULT_LLM_PROVIDER: "bedrock",
      DEFAULT_LLM_MODEL: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      BEDROCK_ACCESS_KEY: "AKIA-xxx",
      BEDROCK_SECRET_KEY: "secret-xxx",
      BEDROCK_REGION: "us-west-2",
    };

    const templateWithBedrock = `${baseTemplate}
BEDROCK_ACCESS_KEY=
BEDROCK_SECRET_KEY=
BEDROCK_REGION=
`;

    const result = generateEnvFile({
      env: bedrockEnv,
      useDockerInfra: false,
      llmProvider: "bedrock",
      template: templateWithBedrock,
    });

    expect(result).toContain("BEDROCK_ACCESS_KEY=AKIA-xxx");
    expect(result).toContain("BEDROCK_SECRET_KEY=secret-xxx");
    expect(result).toContain("BEDROCK_REGION=us-west-2");
  });

  it("should handle OpenAI-compatible provider settings", () => {
    const openaiCompatibleEnv: EnvConfig = {
      ...baseEnv,
      DEFAULT_LLM_PROVIDER: "openai-compatible",
      DEFAULT_LLM_MODEL: "llama-3.2-3b-instruct",
      OPENAI_COMPATIBLE_BASE_URL: "http://localhost:1234/v1",
      OPENAI_COMPATIBLE_MODEL: "llama-3.2-3b-instruct",
      OPENAI_COMPATIBLE_API_KEY: "lm-studio-key",
    };

    const templateWithOpenAICompatible = `${baseTemplate}
OPENAI_COMPATIBLE_BASE_URL=
OPENAI_COMPATIBLE_MODEL=
OPENAI_COMPATIBLE_API_KEY=
`;

    const result = generateEnvFile({
      env: openaiCompatibleEnv,
      useDockerInfra: false,
      llmProvider: "openai-compatible",
      template: templateWithOpenAICompatible,
    });

    expect(result).toContain(
      "OPENAI_COMPATIBLE_BASE_URL=http://localhost:1234/v1",
    );
    expect(result).toContain("OPENAI_COMPATIBLE_MODEL=llama-3.2-3b-instruct");
    expect(result).toContain("OPENAI_COMPATIBLE_API_KEY=lm-studio-key");
    expect(result).toContain("DEFAULT_LLM_PROVIDER=openai-compatible");
  });

  it("should handle commented lines in template", () => {
    const templateWithComments = `# Config
# DATABASE_URL=commented-placeholder
AUTH_SECRET=
`;

    const result = generateEnvFile({
      env: {
        DATABASE_URL: "postgresql://new-url",
        AUTH_SECRET: "new-secret",
      },
      useDockerInfra: false,
      llmProvider: "anthropic",
      template: templateWithComments,
    });

    // Should uncomment and set the value
    expect(result).toContain('DATABASE_URL="postgresql://new-url"');
    expect(result).not.toContain("# DATABASE_URL=");
  });

  it("should append known keys not found in template", () => {
    const minimalTemplate = `# Minimal
AUTH_SECRET=
`;

    const result = generateEnvFile({
      env: {
        AUTH_SECRET: "secret",
        GOOGLE_CLIENT_ID: "google-id-value",
      },
      useDockerInfra: false,
      llmProvider: "anthropic",
      template: minimalTemplate,
    });

    expect(result).toContain("AUTH_SECRET=secret");
    // GOOGLE_CLIENT_ID is a known key handled by setValue, so it should be appended
    expect(result).toContain("GOOGLE_CLIENT_ID=google-id-value");
  });

  it("should preserve template structure and comments", () => {
    const templateWithStructure = `# =============================================================================
# Database Configuration
# =============================================================================
DATABASE_URL=placeholder

# =============================================================================
# Auth
# =============================================================================
AUTH_SECRET=
`;

    const result = generateEnvFile({
      env: {
        DATABASE_URL: "postgresql://test",
        AUTH_SECRET: "secret",
      },
      useDockerInfra: false,
      llmProvider: "anthropic",
      template: templateWithStructure,
    });

    // Should preserve section headers
    expect(result).toContain(
      "# =============================================================================",
    );
    expect(result).toContain("# Database Configuration");
    expect(result).toContain("# Auth");
  });

  it("should generate a complete env file from realistic template", () => {
    const realisticTemplate = `# =============================================================================
# Docker Configuration
# =============================================================================
# POSTGRES_USER=postgres
# POSTGRES_PASSWORD=password
# POSTGRES_DB=inboxzero
# DATABASE_URL="postgresql://postgres:password@localhost:5432/inboxzero"
# UPSTASH_REDIS_URL="http://localhost:8079"

# =============================================================================
# App Configuration
# =============================================================================
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true

# =============================================================================
# Authentication & Security
# =============================================================================
AUTH_SECRET=
EMAIL_ENCRYPT_SECRET=
EMAIL_ENCRYPT_SALT=
INTERNAL_API_KEY=
API_KEY_SALT=
CRON_SECRET=

# =============================================================================
# Google OAuth
# =============================================================================
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_PUBSUB_TOPIC_NAME=projects/your-project/topics/inbox-zero-emails
GOOGLE_PUBSUB_VERIFICATION_TOKEN=

# =============================================================================
# Microsoft OAuth
# =============================================================================
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common
MICROSOFT_WEBHOOK_CLIENT_STATE=

# =============================================================================
# LLM Configuration
# =============================================================================
DEFAULT_LLM_PROVIDER=
DEFAULT_LLM_MODEL=
ECONOMY_LLM_PROVIDER=
ECONOMY_LLM_MODEL=
ANTHROPIC_API_KEY=

# =============================================================================
# Redis
# =============================================================================
UPSTASH_REDIS_TOKEN=
`;

    const fullEnv: EnvConfig = {
      // Docker
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: "supersecretpassword123",
      POSTGRES_DB: "inboxzero",
      DATABASE_URL:
        "postgresql://postgres:supersecretpassword123@db:5432/inboxzero",
      UPSTASH_REDIS_URL: "http://serverless-redis-http:80",
      UPSTASH_REDIS_TOKEN: "redis-token-abc123",
      // App
      NEXT_PUBLIC_BASE_URL: "https://mail.example.com",
      NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: "true",
      // Auth
      AUTH_SECRET: "auth-secret-hex-value",
      EMAIL_ENCRYPT_SECRET: "email-encrypt-secret-hex",
      EMAIL_ENCRYPT_SALT: "email-salt-hex",
      INTERNAL_API_KEY: "internal-api-key-hex",
      API_KEY_SALT: "api-key-salt-hex",
      CRON_SECRET: "cron-secret-hex",
      // Google
      GOOGLE_CLIENT_ID: "123456789-abcdef.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-abcdefghijk",
      GOOGLE_PUBSUB_TOPIC_NAME: "projects/my-project/topics/inbox-zero",
      GOOGLE_PUBSUB_VERIFICATION_TOKEN: "pubsub-token-hex",
      // Microsoft
      MICROSOFT_CLIENT_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      MICROSOFT_CLIENT_SECRET: "microsoft-secret-value",
      MICROSOFT_TENANT_ID: "common",
      MICROSOFT_WEBHOOK_CLIENT_STATE: "webhook-state-hex",
      // LLM
      DEFAULT_LLM_PROVIDER: "anthropic",
      DEFAULT_LLM_MODEL: "claude-sonnet-4-5-20250929",
      ECONOMY_LLM_PROVIDER: "anthropic",
      ECONOMY_LLM_MODEL: "claude-haiku-4-5-20251001",
      ANTHROPIC_API_KEY: "sk-ant-api-key-value",
    };

    const result = generateEnvFile({
      env: fullEnv,
      useDockerInfra: true,
      llmProvider: "anthropic",
      template: realisticTemplate,
    });

    const expectedOutput = `# =============================================================================
# Docker Configuration
# =============================================================================
POSTGRES_USER=postgres
POSTGRES_PASSWORD=supersecretpassword123
POSTGRES_DB=inboxzero
DATABASE_URL="postgresql://postgres:supersecretpassword123@db:5432/inboxzero"
UPSTASH_REDIS_URL="http://serverless-redis-http:80"

# =============================================================================
# App Configuration
# =============================================================================
NEXT_PUBLIC_BASE_URL=https://mail.example.com
NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true

# =============================================================================
# Authentication & Security
# =============================================================================
AUTH_SECRET=auth-secret-hex-value
EMAIL_ENCRYPT_SECRET=email-encrypt-secret-hex
EMAIL_ENCRYPT_SALT=email-salt-hex
INTERNAL_API_KEY=internal-api-key-hex
API_KEY_SALT=api-key-salt-hex
CRON_SECRET=cron-secret-hex

# =============================================================================
# Google OAuth
# =============================================================================
GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijk
GOOGLE_PUBSUB_TOPIC_NAME=projects/my-project/topics/inbox-zero
GOOGLE_PUBSUB_VERIFICATION_TOKEN=pubsub-token-hex

# =============================================================================
# Microsoft OAuth
# =============================================================================
MICROSOFT_CLIENT_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
MICROSOFT_CLIENT_SECRET=microsoft-secret-value
MICROSOFT_TENANT_ID=common
MICROSOFT_WEBHOOK_CLIENT_STATE=webhook-state-hex

# =============================================================================
# LLM Configuration
# =============================================================================
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=claude-sonnet-4-5-20250929
ECONOMY_LLM_PROVIDER=anthropic
ECONOMY_LLM_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_API_KEY=sk-ant-api-key-value

# =============================================================================
# Redis
# =============================================================================
UPSTASH_REDIS_TOKEN=redis-token-abc123
`;

    expect(result).toBe(expectedOutput);
  });

  it("should not write undefined string when env values are undefined", () => {
    const template = `DATABASE_URL=placeholder
UPSTASH_REDIS_URL=placeholder
AUTH_SECRET=
`;

    // Only set AUTH_SECRET, leave DATABASE_URL and UPSTASH_REDIS_URL undefined
    const result = generateEnvFile({
      env: {
        AUTH_SECRET: "secret123",
        DATABASE_URL: undefined,
        UPSTASH_REDIS_URL: undefined,
      },
      useDockerInfra: false,
      llmProvider: "anthropic",
      template,
    });

    // Should NOT contain the literal string "undefined"
    expect(result).not.toContain('"undefined"');
    expect(result).not.toContain("=undefined");
    // Original placeholders should remain since we didn't set them
    expect(result).toContain("DATABASE_URL=placeholder");
    expect(result).toContain("UPSTASH_REDIS_URL=placeholder");
    expect(result).toContain("AUTH_SECRET=secret123");
  });
});

describe("parseEnvFile", () => {
  it("should parse KEY=value pairs", () => {
    const content = `FOO=bar
BAZ=qux`;
    expect(parseEnvFile(content)).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("should handle quoted values", () => {
    const content = `URL="http://localhost:3000"
NAME='hello world'`;
    expect(parseEnvFile(content)).toEqual({
      URL: "http://localhost:3000",
      NAME: "hello world",
    });
  });

  it("should skip comments and empty lines", () => {
    const content = `# This is a comment
FOO=bar

# Another comment
BAZ=qux
`;
    expect(parseEnvFile(content)).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("should handle values with = signs", () => {
    const content = "URL=postgresql://user:pass@host:5432/db?sslmode=require";
    expect(parseEnvFile(content)).toEqual({
      URL: "postgresql://user:pass@host:5432/db?sslmode=require",
    });
  });

  it("should handle empty values", () => {
    const content = `FOO=
BAR=value`;
    expect(parseEnvFile(content)).toEqual({ FOO: "", BAR: "value" });
  });
});

describe("updateEnvValue", () => {
  it("should update an existing uncommented value", () => {
    const content = "FOO=old\nBAR=other";
    const result = updateEnvValue(content, "FOO", "new");
    expect(result).toContain("FOO=new");
    expect(result).toContain("BAR=other");
  });

  it("should uncomment and set a commented value", () => {
    const content = "# FOO=placeholder\nBAR=other";
    const result = updateEnvValue(content, "FOO", "value");
    expect(result).toContain("FOO=value");
    expect(result).not.toContain("# FOO=");
  });

  it("should append if key not found", () => {
    const content = "FOO=bar";
    const result = updateEnvValue(content, "NEW_KEY", "new_value");
    expect(result).toContain("FOO=bar");
    expect(result).toContain("NEW_KEY=new_value");
  });

  it("should quote values with special characters", () => {
    const content = "URL=old";
    const result = updateEnvValue(content, "URL", "http://localhost:3000");
    expect(result).toContain('URL="http://localhost:3000"');
  });

  it("should not quote simple values", () => {
    const content = "FOO=old";
    const result = updateEnvValue(content, "FOO", "simple");
    expect(result).toContain("FOO=simple");
    expect(result).not.toContain('"simple"');
  });

  it("should escape double quotes in values", () => {
    const content = "FOO=old";
    const result = updateEnvValue(content, "FOO", 'hello"world');
    expect(result).toContain('FOO="hello\\"world"');
  });
});

describe("redactValue", () => {
  it("should redact sensitive keys", () => {
    expect(redactValue("ANTHROPIC_API_KEY", "sk-ant-12345")).toBe("sk-a****");
    expect(redactValue("GOOGLE_CLIENT_SECRET", "GOCSPX-abc")).toBe("GOCS****");
  });

  it("should show placeholder values as not configured", () => {
    expect(redactValue("GOOGLE_CLIENT_ID", "your-google-client-id")).toBe(
      "(not configured)",
    );
    expect(redactValue("GOOGLE_CLIENT_ID", "skipped")).toBe("(not configured)");
  });

  it("should show non-sensitive values in full", () => {
    expect(redactValue("DEFAULT_LLM_PROVIDER", "anthropic")).toBe("anthropic");
    expect(redactValue("NEXT_PUBLIC_BASE_URL", "http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  it("should redact passwords in database URLs", () => {
    const result = redactValue(
      "DATABASE_URL",
      "postgresql://postgres:secretpass@db:5432/inboxzero",
    );
    expect(result).toContain("****@");
    expect(result).not.toContain("secretpass");
  });

  it("should fully redact short sensitive values", () => {
    expect(redactValue("AUTH_SECRET", "ab")).toBe("****");
  });
});

describe("isSensitiveKey", () => {
  it("should identify known sensitive keys", () => {
    expect(isSensitiveKey("ANTHROPIC_API_KEY")).toBe(true);
    expect(isSensitiveKey("AUTH_SECRET")).toBe(true);
    expect(isSensitiveKey("CRON_SECRET")).toBe(true);
  });

  it("should identify keys containing secret/password", () => {
    expect(isSensitiveKey("MY_CUSTOM_SECRET")).toBe(true);
    expect(isSensitiveKey("DB_PASSWORD")).toBe(true);
  });

  it("should not flag non-sensitive keys", () => {
    expect(isSensitiveKey("DEFAULT_LLM_PROVIDER")).toBe(false);
    expect(isSensitiveKey("NEXT_PUBLIC_BASE_URL")).toBe(false);
  });
});

describe("parsePortConflict", () => {
  it("should detect 'port is already allocated' errors", () => {
    const stderr =
      "Error response from daemon: failed to set up container networking: " +
      "driver failed programming external connectivity on endpoint " +
      "inbox-zero-services-redis-1 (abc123): Bind for 0.0.0.0:6380 failed: port is already allocated";
    expect(parsePortConflict(stderr)).toBe(
      "Port 6380 is already in use by another process.",
    );
  });

  it("should detect 'address already in use' errors", () => {
    expect(
      parsePortConflict("listen tcp 0.0.0.0:3000: address already in use"),
    ).toBe("Port 3000 is already in use by another process.");
    expect(
      parsePortConflict("listen tcp 127.0.0.1:8080: address already in use"),
    ).toBe("Port 8080 is already in use by another process.");
    expect(parsePortConflict("listen tcp :5432: address already in use")).toBe(
      "Port 5432 is already in use by another process.",
    );
  });

  it("should return null for unrelated errors", () => {
    expect(parsePortConflict("image not found")).toBeNull();
    expect(parsePortConflict("network timeout")).toBeNull();
    expect(parsePortConflict("")).toBeNull();
  });
});
