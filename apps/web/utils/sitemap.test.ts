import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { getSanityBlogPostsForSitemap } from "./sitemap";

describe("getSanityBlogPostsForSitemap", () => {
  const originalProjectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const originalDataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
  const originalApiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = undefined;
    process.env.NEXT_PUBLIC_SANITY_DATASET = undefined;
    process.env.NEXT_PUBLIC_SANITY_API_VERSION = undefined;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = originalProjectId;
    process.env.NEXT_PUBLIC_SANITY_DATASET = originalDataset;
    process.env.NEXT_PUBLIC_SANITY_API_VERSION = originalApiVersion;
  });

  it("skips the fetch when sanity is not configured", async () => {
    const fetchImpl = vi.fn();

    await expect(getSanityBlogPostsForSitemap(fetchImpl)).resolves.toEqual([]);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps sanity blog slugs to sitemap entries", async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = "marketing-project";

    const json = vi.fn().mockResolvedValue({
      result: [
        { slug: "first-post", date: "2024-01-01T00:00:00.000Z" },
        { slug: null, date: "2024-01-02T00:00:00.000Z" },
      ],
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json,
    });

    await expect(getSanityBlogPostsForSitemap(fetchImpl)).resolves.toEqual([
      {
        url: "https://www.getinboxzero.com/blog/post/first-post",
        lastModified: new Date("2024-01-01T00:00:00.000Z"),
      },
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0];
    const sanityUrl = new URL(url);

    expect(sanityUrl.origin).toBe("https://marketing-project.apicdn.sanity.io");
    expect(sanityUrl.pathname).toBe("/v2024-09-03/data/query/production");
    expect(sanityUrl.searchParams.get("query")).toContain('*[_type == "post"]');
    expect(init).toMatchObject({ next: { revalidate: 3600 } });
  });

  it("returns an empty array when the sanity request fails", async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = "marketing-project";

    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(getSanityBlogPostsForSitemap(fetchImpl)).resolves.toEqual([]);
  });
});
