import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRobots(baseUrl: string, vercelEnv: string) {
  vi.resetModules();
  vi.stubEnv("VERCEL_ENV", vercelEnv);
  vi.doMock("@/env", () => ({
    env: { NEXT_PUBLIC_BASE_URL: baseUrl },
  }));

  const { default: robots } = await import("@/app/robots");
  return robots;
}

describe("robots route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/env");
    vi.resetModules();
  });

  it("returns the existing production rules", async () => {
    const robots = await loadRobots(
      "https://www.getinboxzero.com",
      "production",
    );

    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: "/components",
      },
      sitemap: [
        "https://www.getinboxzero.com/sitemap.xml",
        "https://docs.getinboxzero.com/sitemap.xml",
      ],
    });
  });

  it("disallows every path and omits the sitemap when indexing is off", async () => {
    const robots = await loadRobots(
      "https://staging.getinboxzero.com",
      "production",
    );

    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    });
  });
});
