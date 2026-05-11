import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { saasFounderMixedInbox } from "@/__tests__/fixtures/inboxes/demo-inboxes";
import { toGmailSeedMessages } from "@/__tests__/fixtures/inboxes/adapters";
import {
  createGmailTestHarness,
  type GmailTestHarness,
} from "@/__tests__/integration/helpers";

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "demo inbox fixture Gmail emulator adapter",
  { timeout: 30_000 },
  () => {
    let harness: GmailTestHarness;

    beforeAll(async () => {
      harness = await createGmailTestHarness({
        email: saasFounderMixedInbox.mailbox.email,
        messages: toGmailSeedMessages(saasFounderMixedInbox),
      });
    });

    afterAll(async () => {
      await harness?.emulator.close();
    });

    test("searches and reads a message from the shared fixture", async () => {
      const result = await harness.provider.searchMessages({
        query: "from:no-reply-aws@amazon.com",
        maxResults: 5,
      });
      const securityMessage = result.messages.find(
        (message) =>
          message.subject === "Root MFA disabled on production account",
      );

      expect(securityMessage).toBeDefined();
      expect(securityMessage?.threadId).toBe(
        harness.threadIds[securityMessage!.id],
      );

      const fullMessage = await harness.provider.getMessage(
        securityMessage!.id,
      );

      expect(fullMessage.subject).toBe(
        "Root MFA disabled on production account",
      );
      expect(fullMessage.textPlain).toContain(
        "root multi-factor authentication was disabled",
      );
    });
  },
);
