import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  expectThreadReaderBody,
  insertInboxMailInConversation,
  readLatestMailMutation,
} from "./mail-test-helpers";
import {
  expectSharedMessageBody,
  readPublisherThread,
  readSharedConversationId,
  seedTeam,
  signInTeammate,
} from "./team-comments-test-helpers";

test("publisher shares with a teammate who never received the mail and both see one internal comment", async ({
  page,
  browser,
}, testInfo) => {
  const teammate = await signInTeammate(browser, "b");
  const team = await seedTeam(page, [{ role: "b", account: teammate.account }]);
  try {
    await page.goto(
      `/${team.publisher.id}/mail?thread-id=thr_playwright_reader`,
      { waitUntil: "domcontentloaded" },
    );
    await expectThreadReaderBody(
      page,
      "First message in the reader conversation.",
    );
    const publisherDiscussion = page.getByTestId("publisher-discussion");
    await expect(
      publisherDiscussion.getByRole("button", { name: "Share", exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await publisherDiscussion
      .getByRole("button", { name: "Share", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Share conversation" });
    await expect(dialog).toContainText("past and future messages");
    await dialog.getByLabel("Shared Teammate").check();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "publisher-share-disclosure-and-selection",
    );
    await dialog.getByRole("button", { name: "Share conversation" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    const conversationId = await readSharedConversationId(
      page,
      team.publisherMemberId,
      team.publisher.id,
    );

    await teammate.page.goto(
      `/shared/${conversationId}?memberId=${team.memberIds.b}`,
      { waitUntil: "domcontentloaded" },
    );
    await expectSharedMessageBody(
      teammate.page,
      "First message in the reader conversation.",
    );
    await expectSharedMessageBody(
      teammate.page,
      "A second message proves the complete conversation is rendered.",
    );
    await capturePlaywrightCheckpoint(
      teammate.page,
      testInfo,
      "teammate-shared-reader-no-received-mail",
    );

    const comment = "Synthetic internal decision for the team";
    await teammate.page.getByLabel("Internal comment").fill(comment);
    await teammate.page.getByRole("button", { name: "Post comment" }).click();
    await expect(teammate.page.getByText(comment)).toBeVisible();
    await expect(teammate.page.getByText("Comment posted.")).toBeVisible();
    await expect(publisherDiscussion.getByText(comment)).toBeVisible({
      timeout: 5000,
    });
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "publisher-synchronized-comment",
    );
    await capturePlaywrightCheckpoint(
      teammate.page,
      testInfo,
      "teammate-synchronized-comment",
    );

    const afterComment = await readPublisherThread(
      page,
      team.publisher.id,
      "thr_playwright_reader",
    );
    expect(afterComment).toHaveLength(2);
    expect(afterComment.some((message) => message.body.includes(comment))).toBe(
      false,
    );

    const replyBody = "External reply for Dana only";
    const receivedMail = page.locator(
      '[data-thread-message-id="msg_playwright_reader_1"]',
    );
    const replyButton = receivedMail.getByRole("button", {
      name: "Reply",
      exact: true,
    });
    if (!(await replyButton.isVisible())) await receivedMail.click();
    await replyButton.click();
    await receivedMail
      .getByRole("textbox", { name: "Email message" })
      .fill(replyBody);
    await page
      .getByRole("button", { name: "Send", exact: true })
      .first()
      .click();
    await expect
      .poll(
        () =>
          readLatestMailMutation(page, {
            emailAccountId: team.publisher.id,
            kind: "reply",
            threadId: "thr_playwright_reader",
          }),
        { timeout: 25_000 },
      )
      .toMatchObject({ status: "succeeded" });
    const afterReply = await readPublisherThread(
      page,
      team.publisher.id,
      "thr_playwright_reader",
    );
    expect(afterReply).toHaveLength(3);
    const externalReplies = afterReply.filter((message) =>
      message.body.includes(replyBody),
    );
    expect(externalReplies).toHaveLength(1);
    expect(externalReplies[0].to).toContain("dana@example.com");
    expect(externalReplies[0].to).not.toContain(teammate.account.email);
    expect(afterReply.some((message) => message.body.includes(comment))).toBe(
      false,
    );
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "publisher-external-reply-no-internal-comment",
    );

    await page.close();
    await insertInboxMailInConversation(teammate.page, {
      threadId: "thr_playwright_reader",
      messageId: "msg_playwright_reader_2",
      subject: "Re: Reader Navigation Message",
      from: "Dana Example <dana@example.com>",
    });
    await expectSharedMessageBody(
      teammate.page,
      "New mail in the archived conversation.",
      35_000,
    );
    await expect(teammate.page.getByText(comment)).toBeVisible();
    await teammate.page.getByText(comment).scrollIntoViewIfNeeded();
    await capturePlaywrightCheckpoint(
      teammate.page,
      testInfo,
      "new-provider-mail-and-internal-discussion",
    );
    await teammate.page.setViewportSize({ width: 390, height: 844 });
    await capturePlaywrightCheckpoint(
      teammate.page,
      testInfo,
      "narrow-shared-reader-light",
    );
    await teammate.page.emulateMedia({ colorScheme: "dark" });
    await teammate.page.addInitScript(() =>
      localStorage.setItem("theme", "dark"),
    );
    await teammate.page.reload();
    await expect(teammate.page.getByText(comment)).toBeVisible({
      timeout: 60_000,
    });
    await expectSharedMessageBody(
      teammate.page,
      "First message in the reader conversation.",
    );
    await capturePlaywrightCheckpoint(
      teammate.page,
      testInfo,
      "narrow-shared-reader-dark",
    );
  } finally {
    await team.cleanup();
    await teammate.context.close();
  }
});
