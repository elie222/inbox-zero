import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  expectSharedMessageBody,
  readSharedConversationId,
  seedTeam,
  signInTeammate,
} from "./team-comments-test-helpers";

test("cancelled selection grants nothing; nonparticipants and revoked members cannot read", async ({
  page,
  browser,
}, testInfo) => {
  const b = await signInTeammate(browser, "b");
  const c = await signInTeammate(browser, "c");
  const d = await signInTeammate(browser, "d");
  const team = await seedTeam(page, [
    { role: "b", account: b.account },
    { role: "c", account: c.account },
    { role: "d", account: d.account },
  ]);
  const anonymous = await browser.newContext({
    baseURL: process.env.NEXT_PUBLIC_BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    await page.goto(
      `/${team.publisher.id}/mail?thread-id=thr_playwright_reader`,
      { waitUntil: "domcontentloaded" },
    );
    const publisherDiscussion = page.getByTestId("publisher-discussion");
    await publisherDiscussion
      .getByRole("button", { name: "Share", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Share conversation" });
    await dialog.getByLabel("Shared Teammate").check();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    const unshared = await page.request.get(
      `/api/team-comments/conversations?memberId=${team.publisherMemberId}&emailAccountId=${team.publisher.id}&providerConversationId=thr_playwright_reader`,
    );
    expect(((await unshared.json()) as { source: unknown }).source).toBeNull();
    await publisherDiscussion
      .getByRole("button", { name: "Share", exact: true })
      .click();
    await dialog.getByLabel("Shared Teammate").check();
    await dialog.getByRole("button", { name: "Share conversation" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    const id = await readSharedConversationId(
      page,
      team.publisherMemberId,
      team.publisher.id,
    );

    for (const outsider of [
      { page: c.page, memberId: team.memberIds.c },
      { page: d.page, memberId: team.memberIds.d },
    ]) {
      for (const path of [
        `/api/team-comments/conversations/${id}`,
        `/api/team-comments/conversations/${id}/messages`,
        `/api/team-comments/conversations/${id}/comments`,
        `/api/team-comments/conversations/${id}/attachments/0:0`,
        "/api/team-comments/stream?conversationId=" +
          id +
          "&memberId=" +
          outsider.memberId,
      ]) {
        const separator = path.includes("?") ? "&" : "?";
        const response = await outsider.page.request.get(
          `${path}${path.includes("/stream?") ? "" : `${separator}memberId=${outsider.memberId}`}`,
        );
        expect(response.ok(), path).toBe(false);
      }
    }
    const anonymousResponse = await anonymous.request.get(
      `/api/team-comments/conversations/${id}?memberId=${team.memberIds.b}`,
    );
    expect(anonymousResponse.ok()).toBe(false);
    const wrongAccount = await page.request.get(
      `/api/team-comments/conversations?memberId=${team.publisherMemberId}&emailAccountId=${team.extraAccountId}&providerConversationId=thr_playwright_reader`,
    );
    expect(wrongAccount.ok()).toBe(false);

    await b.page.goto(`/shared/${id}?memberId=${team.memberIds.b}`, {
      waitUntil: "domcontentloaded",
    });
    await expectSharedMessageBody(
      b.page,
      "First message in the reader conversation.",
    );
    if (
      !(await publisherDiscussion
        .getByRole("button", { name: "Remove Shared Teammate" })
        .isVisible())
    ) {
      await publisherDiscussion
        .getByRole("button", { name: /Comments/ })
        .click();
    }
    await publisherDiscussion
      .getByRole("button", { name: "Remove Shared Teammate" })
      .click();
    await expect(
      b.page
        .getByRole("alert", { name: "" })
        .filter({ hasText: "access to this conversation has ended" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(b.page.getByRole("article")).toHaveCount(0);
    await capturePlaywrightCheckpoint(
      b.page,
      testInfo,
      "teammate-revoked-access",
    );
    const denied = await b.page.request.get(
      `/api/team-comments/conversations/${id}/messages?memberId=${team.memberIds.b}`,
    );
    expect(denied.ok()).toBe(false);
    await publisherDiscussion
      .getByRole("button", { name: "Stop sharing" })
      .click();
    await expect(
      publisherDiscussion.getByRole("button", { name: "Share", exact: true }),
    ).toBeVisible();
    await expect(
      publisherDiscussion.getByRole("group", { name: "Shared participants" }),
    ).toHaveCount(0);
    await expect(
      publisherDiscussion.getByRole("heading", { name: "Internal discussion" }),
    ).toHaveCount(0);
  } finally {
    await team.cleanup();
    await Promise.all([
      b.context.close(),
      c.context.close(),
      d.context.close(),
      anonymous.close(),
    ]);
  }
});
