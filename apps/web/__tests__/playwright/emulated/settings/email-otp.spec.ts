import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { openSettings } from "./settings-test-helpers";

test("an assistant signs in after owner opt-in and loses access when it is disabled", async ({
  page,
  browser,
  request,
}) => {
  await openSettings(page);
  const toggle = page.getByRole("switch", {
    name: "Allow sign-in with a one-time email code",
    exact: true,
  });
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  const assistant = await browser.newContext({
    baseURL: process.env.NEXT_PUBLIC_BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  const assistantPage = await assistant.newPage();
  try {
    await toggle.click();
    await expect(toggle).toBeChecked();
    await page.reload();
    await expect(toggle).toBeChecked();
    await toggle.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath("email-code-settings.png"),
      fullPage: true,
    });

    const email = process.env.PLAYWRIGHT_TEST_EMAIL!;
    await assistantPage.goto("/login?next=%2Fsettings");
    await assistantPage.screenshot({
      path: test.info().outputPath("login-options.png"),
      fullPage: true,
    });
    await assistantPage.getByRole("link", { name: "Other options" }).click();
    await expect(
      assistantPage.getByRole("link", {
        name: "Email code (existing accounts)",
        exact: true,
      }),
    ).toBeVisible();
    await assistantPage.screenshot({
      path: test.info().outputPath("other-login-options.png"),
      fullPage: true,
    });
    await assistantPage
      .getByRole("link", {
        name: "Email code (existing accounts)",
        exact: true,
      })
      .click();
    await expect(assistantPage).toHaveURL(/\/login\/email\?next=/);
    await expect(
      assistantPage.getByRole("button", { name: "Sign in with Google" }),
    ).toHaveCount(0);
    await assistantPage.screenshot({
      path: test.info().outputPath("email-code-login.png"),
      fullPage: true,
    });
    await assistantPage.getByLabel("Email", { exact: true }).fill(email);
    await assistantPage
      .getByRole("button", { name: "Send code", exact: true })
      .click();
    await expect(
      assistantPage.getByLabel("Sign-in code", { exact: true }),
    ).toBeVisible();
    await assistantPage.screenshot({
      path: test.info().outputPath("email-code-verification.png"),
      fullPage: true,
    });

    let code: string | undefined;
    await expect
      .poll(async () => {
        const response = await request.get(
          `${process.env.PLAYWRIGHT_EMAIL_BASE_URL}/messages?to=${encodeURIComponent(email)}`,
        );
        const messages = (await response.json()) as {
          text: string;
          subject: string;
        }[];
        code = messages
          .findLast(
            (message) => message.subject === "Your Inbox Zero sign-in code",
          )
          ?.text.match(/\b\d{6}\b/)?.[0];
        return !!code;
      })
      .toBe(true);
    await assistantPage.getByLabel("Sign-in code", { exact: true }).fill(code!);
    await assistantPage
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(assistantPage).toHaveURL(/\/settings$/);
    const assistantToggle = assistantPage.getByRole("switch", {
      name: "Allow sign-in with a one-time email code",
      exact: true,
    });
    await expect(assistantToggle).toBeChecked();
    await expect(assistantToggle).toBeDisabled();
    const accounts = await assistant.request.get("/api/user/email-accounts");
    expect(accounts.ok()).toBe(true);
    expect(
      (await accounts.json()).emailAccounts.some(
        (account: { email: string }) => account.email === email,
      ),
    ).toBe(true);

    await toggle.click();
    await expect(toggle).not.toBeChecked();
    expect(
      (await assistant.request.get("/api/user/email-accounts")).status(),
    ).toBe(401);
  } finally {
    await assistant.close();
    if (await toggle.isChecked()) {
      await toggle.click();
      await expect(toggle).not.toBeChecked();
    }
  }
});

test("email code login does not disclose account existence", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("link", { name: "Other options" }).click();
  await page
    .getByRole("link", { name: "Email code (existing accounts)", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("unknown@example.com");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByLabel("Sign-in code", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
});
