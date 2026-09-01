import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { markAutomationOnboardingViewed } from "./automation-tabs-test-helpers";

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

  await page.getByRole("switch").click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("mode") === "apply",
  );
  await expect(page.getByRole("button", { name: "Run on All" })).toBeVisible();
  await expect(
    page.getByText("Run your rules on previous emails", { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("switch")).toBeChecked();
  await expect(search).toHaveValue("Playwright Test Message");
  await expect(page.getByRole("button", { name: "Run on All" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("switch").click();
  await expect(page.getByRole("button", { name: "Test All" })).toBeVisible();
  await expect(customContent).toBeVisible();
});
