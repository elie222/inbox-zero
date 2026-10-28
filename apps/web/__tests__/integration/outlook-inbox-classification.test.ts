import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createOutlookTestHarness, type OutlookTestHarness } from "./helpers";

vi.mock("server-only", () => ({}));

const EMAIL = "outlook-classification@example.com";

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
  "Outlook inbox classification",
  { timeout: 30_000 },
  () => {
    let harness: OutlookTestHarness;

    beforeAll(async () => {
      harness = await createOutlookTestHarness({
        email: EMAIL,
        messages: ["focused", "other", null].map((classification) => ({
          user_email: EMAIL,
          subject: classification ?? "Unclassified",
          inference_classification: classification,
          body_content: "Inbox section fixture",
          parent_folder_id: "inbox",
          received_date_time: "2026-09-18T12:00:00Z",
        })),
      });
    });

    afterAll(async () => {
      harness?.restoreFetch();
      await harness?.emulator.close();
    });

    it("preserves explicit classifications and leaves unset messages unclassified", async () => {
      const { value } = await harness.graphClient.api("/me/messages").get();
      for (const subject of ["focused", "other", "Unclassified"]) {
        const message = value.find(
          (entry: { subject: string }) => entry.subject === subject,
        );
        expect(message.inferenceClassification).toBe(
          subject === "Unclassified" ? null : subject,
        );
      }
    });

    it("moves a message between section filters when Graph classification changes", async () => {
      const query = () =>
        harness.graphClient
          .api("/me/messages")
          .filter("inferenceClassification eq 'focused'")
          .get();
      const focused = await query();
      expect(
        focused.value.map((message: { subject: string }) => message.subject),
      ).toEqual(["focused"]);
      const id = focused.value[0].id;
      await harness.graphClient
        .api(`/me/messages/${id}`)
        .patch({ inferenceClassification: "other" });
      expect((await query()).value).toEqual([]);
      const other = await harness.graphClient
        .api("/me/messages")
        .filter("inferenceClassification eq 'other'")
        .get();
      expect(
        other.value
          .map((message: { subject: string }) => message.subject)
          .sort(),
      ).toEqual(["focused", "other"]);
      const converted = await harness.provider.getMessage(id);
      expect(converted.inboxSection).toBe("other");
    });
  },
);
