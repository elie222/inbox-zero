import { expect } from "@playwright/test";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

for (const draftOnly of [false, true]) {
  test(`preserves multiple server drafts ${draftOnly ? "without a sent parent" : "without reply headers"}`, async ({
    page,
  }, testInfo) => {
    await page.route(
      "**/api/threads/thr_playwright_reply?includeDrafts=true",
      async (route) => {
        const response = await route.fetch();
        const data: ThreadResponse = await response.json();
        const parent = data.thread.messages[0];
        const drafts = ["First", "Second"].map((label, index) => ({
          ...parent,
          id: `server-draft-${index}`,
          labelIds: ["DRAFT"],
          textHtml: `<p>${label} saved reply</p>`,
          textPlain: `${label} saved reply`,
          attachments: [],
          headers: {
            ...parent.headers,
            from: "sender@example.com",
            to: "recipient@example.com",
            "message-id": `<draft-${index}@example.com>`,
            "in-reply-to": undefined,
            references: undefined,
          },
        }));
        await route.fulfill({
          json: {
            ...data,
            thread: {
              ...data.thread,
              messages: [...(draftOnly ? [] : data.thread.messages), ...drafts],
            },
          },
        });
      },
    );
    const { conversations } = await openMail(page);
    await conversationWithSubject(
      page,
      conversations,
      "Reply Workflow Message",
    ).click();
    const editors = page.getByRole("textbox", { name: "Email message" });
    await expect(editors).toHaveCount(2);
    await expect(editors.nth(0)).toContainText("First saved reply");
    await expect(editors.nth(1)).toContainText("Second saved reply");
    await editors.nth(0).fill("Independent first edit");
    await expect(editors.nth(1)).toContainText("Second saved reply");
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      draftOnly ? "draft-only-composers" : "multiple-server-drafts",
    );
    if (!draftOnly) {
      await page
        .locator('[data-thread-message-id="msg_playwright_reply"]')
        .getByRole("button", { name: "Forward", exact: true })
        .click();
      await expect(editors).toHaveCount(3);
      await expect(editors.nth(0)).toContainText("Independent first edit");
      await expect(editors.nth(1)).toContainText("Second saved reply");

      const pendingDiscards = [
        Promise.withResolvers<void>(),
        Promise.withResolvers<void>(),
      ];
      let discards = 0;
      await page.route("**/*", async (route) => {
        const request = route.request();
        const body = request.postData() ?? "";
        if (
          request.headers()["next-action"] &&
          body.includes("server-draft-") &&
          !body.includes("messageHtml")
        ) {
          await pendingDiscards[discards++].promise;
          await route.abort("failed");
          return;
        }
        await route.fallback();
      });
      await page
        .getByRole("button", { name: "Discard draft", exact: true })
        .nth(0)
        .click();
      await expect(editors).toHaveCount(2);
      await page
        .getByRole("button", { name: "Discard draft", exact: true })
        .nth(0)
        .click();
      await expect(editors).toHaveCount(1);
      await expect.poll(() => discards).toBe(2);
      pendingDiscards[0].resolve();
      await expect(editors).toHaveCount(2);
      pendingDiscards[1].resolve();
      await expect(editors).toHaveCount(3);
      await expect(editors.nth(0)).toContainText("Independent first edit");
      await expect(editors.nth(1)).toContainText("Second saved reply");
      await capturePlaywrightCheckpoint(
        page,
        testInfo,
        "restored-server-drafts",
      );
    }
  });
}
