import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createOutlookTestHarness, type OutlookTestHarness } from "./helpers";

vi.mock("server-only", () => ({}));

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
  "Outlook category updates",
  { timeout: 30_000 },
  () => {
    let harness: OutlookTestHarness;
    let categoryId: string;

    beforeAll(async () => {
      harness = await createOutlookTestHarness({
        email: "outlook-category@example.com",
        messages: [],
      });
      const category = await harness.graphClient
        .api("/me/outlook/masterCategories")
        .post({ displayName: "Project", color: "preset1" });
      categoryId = category.id;
    });

    afterAll(async () => {
      harness?.restoreFetch();
      await harness?.emulator.close();
    });

    it("persists a category color changed through the provider", async () => {
      await harness.provider.updateLabel(categoryId, {
        color: { backgroundColor: "#1A5276", textColor: "#ffffff" },
      });
      const category = await harness.graphClient
        .api(`/me/outlook/masterCategories/${categoryId}`)
        .get();
      expect(category).toMatchObject({
        id: categoryId,
        displayName: "Project",
        color: "preset22",
      });
    });

    it("rejects invalid colors without changing the category", async () => {
      const request = harness.graphClient.api(
        `/me/outlook/masterCategories/${categoryId}`,
      );
      const before = await request.get();
      await expect(
        harness.graphClient
          .api(`/me/outlook/masterCategories/${categoryId}`)
          .patch({ color: "unknown-color" }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(await request.get()).toEqual(before);
    });

    it("rejects a category missing from the authenticated mailbox", async () => {
      await expect(
        harness.graphClient
          .api("/me/outlook/masterCategories/missing-category")
          .patch({ color: "preset7" }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  },
);
