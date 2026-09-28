import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRobots({
  baseUrl,
  disableIndexing,
  vercelEnv,
}: {
  baseUrl: string;
  disableIndexing: boolean;
  vercelEnv: string | undefined;
}) {
  vi.resetModules();
  vi.stubEnv("VERCEL_ENV", vercelEnv);
  vi.doMock("@/env", () => ({
    env: {
      NEXT_PUBLIC_BASE_URL: baseUrl,
      NEXT_PUBLIC_DISABLE_INDEXING: disableIndexing,
    },
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
    const robots = await loadRobots({
      baseUrl: "https://www.getinboxzero.com",
      disableIndexing: false,
      vercelEnv: "production",
    });

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

  it("disallows all crawling and drops the sitemap on staging", async () => {
    const robots = await loadRobots({
      baseUrl: "https://staging.getinboxzero.com",
      disableIndexing: false,
      vercelEnv: "production",
    });

    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    });
  });

  it("disallows all crawling on preview deploys", async () => {
    const robots = await loadRobots({
      baseUrl: "https://inbox-zero-git-branch.vercel.app",
      disableIndexing: false,
      vercelEnv: "preview",
    });

    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    });
  });
});
