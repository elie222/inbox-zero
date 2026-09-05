import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { markAutomationOnboardingViewed } from "./automation-tabs-test-helpers";

for (const custom of [false, true]) {
  test(`can test ${custom ? "custom content" : "an email"} after browser translation replaces button text`, async ({
    page,
  }) => {
    const emailAccountId = await getEmailAccountId(page);
    await markAutomationOnboardingViewed(page);
    await page.goto(`/${emailAccountId}/automation?tab=test`);
    if (custom) {
      await page.getByRole("button", { name: "Custom" }).click();
      await page
        .locator("textarea[name=content]")
        .fill("A routine project update.");
    }
    const scope = custom
      ? page.locator("form").filter({ has: page.locator("textarea") })
      : page.getByRole("row").filter({ hasText: "Playwright Test Message" });
    const button = scope.getByRole("button", { name: "Test", exact: true });
    await expect(button).toBeVisible();

    await button.evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const textNodes: Node[] = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      for (const node of textNodes) {
        if (!node.textContent?.trim()) continue;
        // Translation replaces React's text nodes with its own elements.
        const translated = document.createElement("font");
        translated.textContent = node.textContent;
        node.parentNode?.replaceChild(translated, node);
      }
    });

    const actionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        !!response.request().headers()["next-action"],
    );
    await button.click();
    await actionResponse;
    await expect(scope).toBeVisible();
    if (custom) {
      await expect(
        page.getByText("Test result", { exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        scope.getByRole("button", { name: "Retest", exact: true }),
      ).toBeEnabled();
    }
  });
}

test("preserves search, custom email, and Apply workspace state", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  await markAutomationOnboardingViewed(page);

  const messagesResponse = await page.request.get("/api/messages", {
    headers: { "X-Email-Account-ID": emailAccountId },
  });
  expect(messagesResponse.ok()).toBeTruthy();

  await page.goto(`/${emailAccountId}/automation?tab=test`);
  await expect(
    page.getByRole("button", { name: "Test", exact: true }),
  ).toHaveAttribute("data-selected", "true");
  const search = page.getByPlaceholder("Search emails...");
  await search.fill("Playwright Test Message");
  await search.press("Enter");
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("search") === "Playwright Test Message",
  );
  await expect(search).toHaveValue("Playwright Test Message");

  await page.getByRole("button", { name: "Custom" }).click();
  const customContent = page.getByPlaceholder(
    "Paste in email content or write your own. e.g. Receipt from Stripe for $49",
  );
  await expect(customContent).toBeVisible();
  await customContent.fill("A custom receipt from the emulator workspace");
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("custom") === "true",
  );

  const modeSwitch = page.getByRole("switch");
  await expect(async () => {
    if (!(await modeSwitch.isChecked())) await modeSwitch.click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("mode") === "apply",
      { timeout: 5000 },
    );
    await expect(page.getByRole("button", { name: "Run on All" })).toBeVisible({
      timeout: 5000,
    });
  }).toPass({ timeout: 30_000 });
  await expect(
    page.getByText("Run your rules on previous emails", { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(modeSwitch).toBeChecked();
  await expect(search).toHaveValue("Playwright Test Message");
  await expect(page.getByRole("button", { name: "Run on All" })).toBeVisible({
    timeout: 60_000,
  });
  await modeSwitch.click();
  await expect(page.getByRole("button", { name: "Test All" })).toBeVisible();
  await expect(customContent).toBeVisible();
});
