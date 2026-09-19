import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("uses the system dark theme when opening HTML emails", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("theme", "system"));
  const { emailAccountId } = await openMail(page);
  await page.goto(
    `/${emailAccountId}/mail?thread-id=thr_playwright_theme_system`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(
    page.getByRole("heading", { name: "System Theme Message" }),
  ).toBeVisible({ timeout: 60_000 });
  const emailFrame = page
    .frameLocator('iframe[title="Email content preview"]')
    .last();
  await expect(
    emailFrame.getByText("A simple message in the system theme."),
  ).toBeVisible();
  await expect(emailFrame.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(emailFrame.locator("body")).toHaveCSS("color-scheme", "dark");
  await capturePlaywrightCheckpoint(page, testInfo, "mail-reader-system-dark");
});

test("keeps designed HTML emails in their authored light palette in dark mode", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  const { emailAccountId } = await openMail(page);
  await page.goto(
    `/${emailAccountId}/mail?thread-id=thr_playwright_theme_designed`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(
    page.getByRole("heading", { name: "Designed Html Message" }),
  ).toBeVisible({ timeout: 60_000 });
  const emailFrame = page
    .frameLocator('iframe[title="Email content preview"]')
    .last();
  const card = emailFrame.getByText("Finish setup");
  await expect(card).toBeVisible();
  await expect(emailFrame.locator("html")).toHaveCSS("color-scheme", "light");
  await expect(emailFrame.locator("body")).toHaveCSS("color-scheme", "light");
  await expect(
    page.locator('iframe[title="Email content preview"]').last(),
  ).toHaveCSS("color-scheme", "light");
  await expect(card).toHaveCSS("background-color", "rgb(248, 249, 250)");
  await expect(card).toHaveCSS("color", "rgb(32, 33, 36)");
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-designed-html-dark-app",
  );
});

test("keeps the quote toggle between the reply and expanded history", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Re: Reader Visual Message",
  ).click();
  const frame = page
    .frameLocator('iframe[title="Email content preview"]')
    .first();
  await expect(
    frame.getByText("The current reply stays concise and easy to scan."),
  ).toBeVisible();
  const toggle = page.getByRole("button", { name: "Show quoted content" });
  const initialTop = (await toggle.boundingBox())!.y;
  await toggle.click();
  const quoteFrame = page
    .frameLocator('iframe[title="Email content preview"]')
    .last();
  await expect(
    quoteFrame.getByText(
      "This earlier quoted message is hidden until expanded.",
    ),
  ).toBeVisible();
  await expect(
    frame.getByText("The current reply stays concise and easy to scan."),
  ).toBeVisible();
  const collapse = page.getByRole("button", { name: "Hide quoted content" });
  const expandedBox = (await collapse.boundingBox())!;
  expect(Math.abs(expandedBox.y - initialTop)).toBeLessThan(2);
  const quoteBox = (await page
    .locator('iframe[title="Email content preview"]')
    .last()
    .boundingBox())!;
  expect(quoteBox.y).toBeGreaterThanOrEqual(expandedBox.y + expandedBox.height);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-quote-toggle-expanded",
  );
  await collapse.click();
  await expect(
    page.locator('iframe[title="Email content preview"]'),
  ).toHaveCount(1);
  expect(Math.abs((await toggle.boundingBox())!.y - initialTop)).toBeLessThan(
    2,
  );
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-quote-toggle-collapsed",
  );
});

test("captures the rich message reader states", async ({ page }, testInfo) => {
  const releaseSenderStats = Promise.withResolvers<void>();
  await page.route("**/api/user/stats/newsletters?**", async (route) => {
    await releaseSenderStats.promise;
    await route.continue();
  });
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Re: Reader Visual Message",
  ).click();

  await expect(
    page.getByRole("heading", { name: "Re: Reader Visual Message" }),
  ).toBeVisible();

  const emailFrame = page
    .frameLocator('iframe[title="Email content preview"]')
    .first();
  await expect(
    emailFrame.getByText("The current reply stays concise and easy to scan."),
  ).toBeVisible();
  await expect(emailFrame.locator("body")).toHaveCSS(
    "background-color",
    "rgb(35, 35, 38)",
  );
  await expect(emailFrame.locator("body")).toHaveCSS(
    "color",
    "rgb(244, 233, 218)",
  );
  await expect(
    emailFrame.getByText("The current reply stays concise and easy to scan."),
  ).toHaveCSS("margin-bottom", "16px");
  await expect(
    emailFrame.getByText(
      "This earlier quoted message is hidden until expanded.",
    ),
  ).toHaveCount(0);

  const archiveButton = page.getByRole("button", {
    name: "Archive",
    exact: true,
  });
  await expect(archiveButton.locator("kbd")).toHaveCount(0);
  await archiveButton.hover();
  const archiveTooltip = page.getByRole("tooltip", { name: /Archive/ });
  await expect(archiveTooltip).toContainText("Archive");
  await expect(archiveTooltip.locator("kbd")).toHaveText("E");
  await capturePlaywrightCheckpoint(page, testInfo, "mail-reader-toolbar");

  const message = page.locator("[data-thread-message-id]").last();
  await page
    .getByRole("heading", { name: "Re: Reader Visual Message" })
    .hover();
  await message.hover();
  await message.getByRole("button", { name: "Reply", exact: true }).hover();
  const replyTooltip = page.getByRole("tooltip", { name: /Reply/ });
  await expect(replyTooltip).toContainText("Reply");
  await expect(replyTooltip.locator("kbd")).toHaveText("R");
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-reply-shortcut",
  );
  await message.getByRole("button", { name: "Forward", exact: true }).hover();
  const forwardTooltip = page.getByRole("tooltip", { name: /Forward/ });
  await expect(forwardTooltip).toContainText("Forward");
  await expect(forwardTooltip.locator("kbd")).toHaveText("F");
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-reply-forward-shortcuts",
  );

  const senderStatsResponse = page.waitForResponse((response) =>
    response.url().includes("/api/user/stats/newsletters"),
  );
  await page.getByRole("button", { name: /^More actions/ }).click();
  const actionsMenu = page.getByRole("menu");
  const autoArchive = actionsMenu.getByRole("menuitem", {
    name: "Auto archive future emails",
  });
  const openInGmail = actionsMenu.getByRole("menuitem", {
    name: "Open in Gmail",
  });
  await expect(autoArchive).toBeVisible();
  await expect(autoArchive).toHaveAttribute("aria-disabled", "true");
  await actionsMenu.evaluate((menu) =>
    Promise.all(menu.getAnimations().map((animation) => animation.finished)),
  );
  const openInGmailBeforeLoad = await openInGmail.boundingBox();
  expect(openInGmailBeforeLoad).not.toBeNull();
  releaseSenderStats.resolve();
  expect((await senderStatsResponse).ok()).toBe(true);
  await expect(autoArchive).not.toHaveAttribute("aria-disabled", "true");
  const openInGmailAfterLoad = await openInGmail.boundingBox();
  expect(openInGmailAfterLoad?.y).toBe(openInGmailBeforeLoad?.y);
  await expect(
    actionsMenu.getByRole("menuitem", { name: "Mark as spam" }),
  ).toBeVisible();
  await expect(actionsMenu.getByRole("menuitem").last()).toHaveText(
    /Open in Gmail/,
  );
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-sender-actions",
  );
  await page.keyboard.press("Escape");

  const attachmentPreview = page.getByRole("img", {
    name: "reader-preview.png",
  });
  await expect(attachmentPreview).toBeVisible();
  await expect
    .poll(() =>
      attachmentPreview.evaluate(
        (image) => (image as HTMLImageElement).naturalWidth,
      ),
    )
    .toBeGreaterThan(0);

  const sentMessage = page
    .getByText("Me", { exact: true })
    .first()
    .locator("..");
  await expect(sentMessage.locator("img")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show quoted content" }),
  ).toBeVisible();

  await capturePlaywrightCheckpoint(page, testInfo, "mail-reader-rich-message");

  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await expect(page.getByText("From", { exact: true })).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-message-details",
  );

  await page.getByRole("button", { name: "Show quoted content" }).click();
  await expect(
    page
      .frameLocator('iframe[title="Email content preview"]')
      .last()
      .getByText("This earlier quoted message is hidden until expanded."),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-quoted-content",
  );
});

test("offers to disable auto archive for an enabled sender", async ({
  page,
}) => {
  await page.route("**/api/user/stats/newsletters?**", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      body: JSON.stringify({
        ...body,
        searchedSenderStatus: "AUTO_ARCHIVED",
      }),
      contentType: "application/json",
      response,
    });
  });
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Re: Reader Visual Message",
  ).click();

  await page.getByRole("button", { name: /^More actions/ }).click();
  const actionsMenu = page.getByRole("menu");
  await expect(
    actionsMenu.getByRole("menuitem", { name: "Disable auto archive" }),
  ).toBeEnabled();
  await expect(
    actionsMenu.getByRole("menuitem", {
      name: "Auto archive future emails",
    }),
  ).toHaveCount(0);
});

test("opens the sender profile beside the reader", async ({
  page,
}, testInfo) => {
  await page.route("**/api/user/public-contact-context/**", (route) =>
    route.fulfill({
      json: {
        status: "found",
        context: {
          role: "Head of Product",
          company: {
            name: "Example Labs",
            domain: "example.com",
            website: "https://example.com",
            description: "Builds collaboration tools for distributed teams.",
            industry: "Software",
            employeeCount: "51-200 employees",
            funding: "Series A",
          },
          sources: ["https://example.com/team", "https://example.com/about"],
          confidence: "high",
        },
      },
    }),
  );
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Re: Reader Visual Message",
  ).click();
  const subject = page.getByRole("heading", {
    name: "Re: Reader Visual Message",
  });
  await expect(subject).toBeVisible();

  await page
    .getByRole("button", {
      exact: true,
      name: "View public profile for Morgan Example",
    })
    .click();
  const panel = page.getByTestId("sender-context-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Head of Product")).toBeVisible();
  await expect(panel.getByText("Example Labs")).toBeVisible();
  // Beside the reader, not over it: the email stays readable and nothing dims.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(subject).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-sender-profile",
  );

  // Too narrow for a second column, so the same profile slides over instead.
  await page.setViewportSize({ width: 700, height: 720 });
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Head of Product")).toBeVisible();
  await expect(panel).toHaveCount(0);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-sender-profile-narrow",
  );

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page
    .getByRole("button", {
      exact: true,
      name: "View public profile for Morgan Example",
    })
    .click();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Close sender profile" }).click();
  await expect(panel).toHaveCount(0);

  // Escape dismisses the pane without also backing out of the thread.
  await page
    .getByRole("button", {
      exact: true,
      name: "View public profile for Morgan Example",
    })
    .click();
  await expect(panel).toBeVisible();
  await expect(panel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(subject).toBeVisible();
});

for (const parent of ["none", "missing"] as const) {
  test(`renders a draft-only thread with ${parent === "missing" ? "a missing parent" : "no parent"}`, async ({
    page,
  }, testInfo) => {
    const threadId =
      parent === "missing"
        ? "thr_playwright_draft_missing_parent"
        : "thr_playwright_draft_orphan";
    const { emailAccountId } = await openMail(page);
    await page.goto(`/${emailAccountId}/mail?thread-id=${threadId}`, {
      waitUntil: "domcontentloaded",
    });
    const message = page.locator("[data-thread-message-id]");
    await expect(message).toHaveCount(1);
    await expect(
      message.getByRole("button", { name: /^Draft to / }),
    ).toBeVisible();
    await expect(
      message.getByRole("textbox", { name: "Email message" }),
    ).toContainText("This unsent draft should remain visible.");
    await capturePlaywrightCheckpoint(page, testInfo, "mail-reader-draft-only");
  });
}
