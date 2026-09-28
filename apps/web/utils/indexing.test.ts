import { describe, expect, it } from "vitest";
import {
  buildRobotsPolicy,
  getMetadataBaseUrl,
  isIndexingAllowed,
  type IndexingDecisionInput,
} from "@/utils/indexing";

const production: IndexingDecisionInput = {
  vercelEnv: "production",
  baseUrl: "https://www.getinboxzero.com",
  disableIndexing: false,
};

const productionRobots = {
  rules: {
    userAgent: "*",
    allow: "/",
    disallow: "/components",
  },
  sitemap: [
    "https://www.getinboxzero.com/sitemap.xml",
    "https://docs.getinboxzero.com/sitemap.xml",
  ],
};

describe("isIndexingAllowed", () => {
  it.each<[string, IndexingDecisionInput, boolean]>([
    ["allows www production", production, true],
    [
      "allows a self-hosted install",
      {
        vercelEnv: undefined,
        baseUrl: "https://mail.example.com",
        disableIndexing: false,
      },
      true,
    ],
    [
      "blocks a production-target staging host",
      {
        vercelEnv: "production",
        baseUrl: "https://staging.getinboxzero.com",
        disableIndexing: false,
      },
      false,
    ],
    [
      "blocks any host that starts with staging.",
      {
        vercelEnv: undefined,
        baseUrl: "https://staging.example.com",
        disableIndexing: false,
      },
      false,
    ],
    [
      "blocks a host whose first label is staging",
      {
        vercelEnv: undefined,
        baseUrl: "https://staging.com",
        disableIndexing: false,
      },
      false,
    ],
    [
      "allows a host that merely contains staging",
      {
        vercelEnv: undefined,
        baseUrl: "https://notstaging.example.com",
        disableIndexing: false,
      },
      true,
    ],
    [
      "blocks Vercel preview even when the base URL is production",
      {
        vercelEnv: "preview",
        baseUrl: "https://www.getinboxzero.com",
        disableIndexing: false,
      },
      false,
    ],
    [
      "blocks preview deploy URLs",
      {
        vercelEnv: "preview",
        baseUrl: "https://inbox-zero-git-branch.vercel.app",
        disableIndexing: false,
      },
      false,
    ],
    [
      "blocks an explicit opt-out on production",
      { ...production, disableIndexing: true },
      false,
    ],
    [
      "matches the staging host case-insensitively",
      {
        vercelEnv: "production",
        baseUrl: "https://Staging.getinboxzero.com",
        disableIndexing: false,
      },
      false,
    ],
  ])("%s", (_name, input, expected) => {
    expect(isIndexingAllowed(input)).toBe(expected);
  });
});

describe("buildRobotsPolicy", () => {
  it("keeps the production robots rules and sitemaps", () => {
    expect(buildRobotsPolicy(production)).toEqual(productionRobots);
  });

  it("keeps a self-hosted sitemap on that install's origin", () => {
    expect(
      buildRobotsPolicy({
        vercelEnv: undefined,
        baseUrl: "https://mail.example.com",
        disableIndexing: false,
      }),
    ).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: "/components",
      },
      sitemap: [
        "https://mail.example.com/sitemap.xml",
        "https://docs.getinboxzero.com/sitemap.xml",
      ],
    });
  });

  it("disallows every path and omits the sitemap when indexing is off", () => {
    expect(
      buildRobotsPolicy({
        vercelEnv: "production",
        baseUrl: "https://staging.getinboxzero.com",
        disableIndexing: false,
      }),
    ).toEqual({
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    });
  });
});

describe("getMetadataBaseUrl", () => {
  it("leaves production and self-hosted origins unchanged", () => {
    expect(getMetadataBaseUrl("https://www.getinboxzero.com")).toBe(
      "https://www.getinboxzero.com",
    );
    expect(getMetadataBaseUrl("https://mail.example.com")).toBe(
      "https://mail.example.com",
    );
    expect(getMetadataBaseUrl("https://inbox-zero-git-branch.vercel.app")).toBe(
      "https://inbox-zero-git-branch.vercel.app",
    );
  });

  it("points staging.getinboxzero.com canonicals at production", () => {
    expect(getMetadataBaseUrl("https://staging.getinboxzero.com")).toBe(
      "https://www.getinboxzero.com",
    );
    expect(getMetadataBaseUrl("https://Staging.getinboxzero.com/")).toBe(
      "https://www.getinboxzero.com",
    );
  });

  it("does not retarget other staging hosts at the Inbox Zero production site", () => {
    expect(getMetadataBaseUrl("https://staging.example.com")).toBe(
      "https://staging.example.com",
    );
    expect(
      getMetadataBaseUrl("https://staging.getinboxzero.com.evil.com"),
    ).toBe("https://staging.getinboxzero.com.evil.com");
  });

  it("ignores an unparseable base URL", () => {
    expect(
      isIndexingAllowed({
        vercelEnv: undefined,
        baseUrl: "not a url",
        disableIndexing: false,
      }),
    ).toBe(true);
    expect(getMetadataBaseUrl("not a url")).toBe("not a url");
  });
});
