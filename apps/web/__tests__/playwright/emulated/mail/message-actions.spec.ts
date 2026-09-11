import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("shows matched reasons only for the selected message", async ({
  page,
}, testInfo) => {
  await page.route(
    "**/api/threads/thr_playwright_reader_visual?**",
    async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const message = body.thread.messages.at(-1);
      body.thread.messages = [
        {
          ...message,
          id: "earlier-message",
          textHtml: "<p>Earlier message body.</p>",
        },
        {
          ...message,
          id: "later-message",
          textHtml: "<p>Later message body.</p>",
        },
      ];
      await route.fulfill({ response, json: body });
    },
  );
  await page.route("**/api/threads?**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const thread = body.threads?.find(
      (thread: { id: string }) => thread.id === "thr_playwright_reader_visual",
    );
    if (thread) {
      thread.plans = [
        {
          id: "earlier-match",
          messageId: "earlier-message",
          rule: { id: "rule-1", name: "Example rule" },
          actionItems: [],
          status: "APPLIED",
          reason: "Reason for the earlier message.",
        },
        {
          id: "later-match",
          messageId: "later-message",
          rule: { id: "rule-1", name: "Example rule" },
          actionItems: [],
          status: "APPLIED",
          reason: "Reason for the later message.",
        },
      ];
    }
    await route.fulfill({ response, json: body });
  });
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Re: Reader Visual Message",
  ).click();
  for (const [id, reason, otherReason] of [
    [
      "earlier-message",
      "Reason for the earlier message.",
      "Reason for the later message.",
    ],
    [
      "later-message",
      "Reason for the later message.",
      "Reason for the earlier message.",
    ],
  ]) {
    const message = page.locator(`[data-thread-message-id="${id}"]`);
    await message.hover();
    await expect(
      message.getByRole("button", { name: "Reply", exact: true }),
    ).toBeVisible();
    await expect(
      message.getByRole("button", { name: "Forward", exact: true }),
    ).toBeVisible();
    await message
      .getByRole("button", { name: "More message actions", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Matched reason" }).click();
    await expect(page.getByText(reason, { exact: true })).toBeVisible();
    await expect(
      page.getByText(otherReason, { exact: true }),
    ).not.toBeVisible();
    await capturePlaywrightCheckpoint(page, testInfo, `matched-reason-${id}`);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }
});
