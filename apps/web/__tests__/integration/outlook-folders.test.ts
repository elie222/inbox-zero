import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createOutlookTestHarness, type OutlookTestHarness } from "./helpers";

vi.mock("server-only", () => ({}));

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
  "Outlook folders with special characters",
  { timeout: 30_000 },
  () => {
    let harness: OutlookTestHarness;

    beforeAll(async () => {
      harness = await createOutlookTestHarness({
        email: "outlook-folders@example.com",
        messages: [],
        folders: [{ id: "existing-folder", display_name: "Partner's Bills" }],
      });
    });

    afterAll(async () => {
      harness?.restoreFetch();
      await harness?.emulator.close();
    });

    it.each([
      "Bills & Receipts",
      "Partner's & Co #2",
    ])("creates %s once and resolves it on later lookups", async (name) => {
      const created = await harness.provider.getOrCreateFolderIdByName(name);
      const resolved = await harness.provider.getOrCreateFolderIdByName(name);

      expect(resolved).toBe(created);
      const folder = await harness.graphClient
        .api(`/me/mailFolders/${created}`)
        .get();
      expect(folder.displayName).toBe(name);
    });

    it("resolves an existing folder with an apostrophe instead of creating it", async () => {
      await expect(
        harness.provider.getOrCreateFolderIdByName("Partner's Bills"),
      ).resolves.toBe("existing-folder");
    });
  },
);
