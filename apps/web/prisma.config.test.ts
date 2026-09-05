import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv/config", () => ({}));

beforeEach(() => {
  vi.resetModules();
  for (const key of [
    "PREVIEW_DATABASE_URL_UNPOOLED",
    "PREVIEW_DATABASE_URL",
    "DIRECT_URL",
    "DATABASE_URL_UNPOOLED",
    "DATABASE_URL",
  ]) {
    vi.stubEnv(key, "");
  }
});

afterEach(() => vi.unstubAllEnvs());

describe("migration database selection", () => {
  it("prefers the preview pooled URL over the primary direct URL", async () => {
    vi.stubEnv("PREVIEW_DATABASE_URL", "postgresql://preview/db");
    vi.stubEnv("DIRECT_URL", "postgresql://primary/db");
    const { default: config } = await import("./prisma.config");
    expect(config.datasource?.url).toBe("postgresql://preview/db");
  });

  it("prefers the preview direct URL when available", async () => {
    vi.stubEnv(
      "PREVIEW_DATABASE_URL_UNPOOLED",
      "postgresql://preview-direct/db",
    );
    vi.stubEnv("PREVIEW_DATABASE_URL", "postgresql://preview/db");
    const { default: config } = await import("./prisma.config");
    expect(config.datasource?.url).toBe("postgresql://preview-direct/db");
  });

  it("preserves direct primary connections outside preview deployments", async () => {
    vi.stubEnv("DIRECT_URL", "postgresql://primary-direct/db");
    vi.stubEnv("DATABASE_URL", "postgresql://primary/db");
    const { default: config } = await import("./prisma.config");
    expect(config.datasource?.url).toBe("postgresql://primary-direct/db");
  });
});
