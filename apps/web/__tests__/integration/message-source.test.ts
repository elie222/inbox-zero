/**
 * Integration test: raw message source via @inbox-zero/emulate
 *
 * Usage:
 *   pnpm test-integration message-source
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createGmailTestHarness, type GmailTestHarness } from "./helpers";

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const TEST_EMAIL = "source-test@example.com";

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Message source",
  { timeout: 30_000 },
  () => {
    let harness: GmailTestHarness;

    beforeAll(async () => {
      harness = await createGmailTestHarness({
        port: 4123,
        email: TEST_EMAIL,
        messages: [
          {
            id: "msg_source",
            user_email: TEST_EMAIL,
            from: "sender@example.com",
            to: TEST_EMAIL,
            subject: "Source subject",
            body_text: "Source body",
            label_ids: ["INBOX"],
            internal_date: "1711900000000",
          },
        ],
      });
    });

    afterAll(async () => {
      await harness?.emulator.close();
    });

    test("Gmail returns the message as MIME", async () => {
      const source = (
        await harness.provider.getMessageSource("msg_source")
      ).toString("utf8");

      expect(source).toMatch(/^Subject: Source subject\r?$/m);
      expect(source).toMatch(/^From: .*sender@example\.com/m);
      expect(source).toContain("Source body");
    });
  },
);
