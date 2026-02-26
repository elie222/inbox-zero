import { expect, test, type Locator, type Page } from "@playwright/test";

test("local bypass completes onboarding and reaches app pages", async ({
  page,
}) => {
  await page.goto("/login?next=%2Fwelcome-redirect%3Fforce%3Dtrue");

  const bypassLoginButton = page.getByRole("button", {
    name: "Bypass login (local only)",
  });
  await expect(bypassLoginButton).toBeVisible();
  const signInResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/api/auth/sign-in/local-bypass"),
  );
  await bypassLoginButton.click();
  const signInResponse = await signInResponsePromise;
  expect(signInResponse.ok()).toBeTruthy();

  const emailAccountId = await getEmailAccountId(page);
  try {
    await page.goto(`/${emailAccountId}/onboarding?step=1&force=true`);
  } catch (error) {
    if (!isInterruptedNavigationError(error)) throw error;
  }
  await expect
    .poll(() => isOnboardingPage(page.url()), {
      timeout: 60_000,
    })
    .toBeTruthy();

  await completeOnboardingFlow(page);
  await expect(page).toHaveURL(
    /\/(?:welcome-upgrade|[a-z0-9]+\/setup)(?:\?.*)?$/,
  );

  await page.goto(`/${emailAccountId}/bulk-unsubscribe`);
  await expect(page).toHaveURL(
    new RegExp(`/${emailAccountId}/bulk-unsubscribe(?:\\?.*)?$`),
  );
  await expect(
    page.getByRole("heading", {
      name: "Bulk Unsubscriber",
    }),
  ).toBeVisible();
});

async function getEmailAccountId(page: Page) {
  const timeoutAt = Date.now() + 90_000;

  while (Date.now() < timeoutAt) {
    const response = await page.request.get("/api/user/email-accounts");
    if (response.ok()) {
      const payload = (await response.json()) as {
        emailAccounts: { id: string }[];
      };
      const firstEmailAccountId = payload.emailAccounts[0]?.id;
      if (firstEmailAccountId) return firstEmailAccountId;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error("Timed out waiting for local bypass email account");
}

async function completeOnboardingFlow(page: Page) {
  const maxSteps = 60;

  for (let step = 0; step < maxSteps; step++) {
    const currentUrl = page.url();
    if (!isOnboardingPage(currentUrl)) {
      return;
    }

    if (
      await clickIfVisible(
        page,
        page.getByRole("button", { name: /^Founder\b/ }),
        1000,
      )
    ) {
      await waitForOnboardingUpdate(page, currentUrl, 10_000);
      await clickIfVisible(
        page,
        page.getByRole("button", { name: /^Continue\b/ }),
        5000,
      );
      continue;
    }

    if (
      await clickIfVisible(
        page,
        page.getByRole("button", { name: "Only me" }),
        1000,
      )
    ) {
      await waitForOnboardingUpdate(page, currentUrl, 10_000);
      continue;
    }

    if (
      await clickIfVisible(
        page,
        page.getByRole("button", { name: "No, thanks" }),
        1000,
      )
    ) {
      await waitForOnboardingUpdate(page, currentUrl, 10_000);
      continue;
    }

    if (
      await clickIfVisible(
        page,
        page.getByRole("button", { name: "Skip" }),
        1000,
      )
    ) {
      await waitForOnboardingUpdate(page, currentUrl, 10_000);
      continue;
    }

    if (
      await clickIfVisible(
        page,
        page.getByRole("button", { name: /^Continue\b/ }),
        5000,
      )
    ) {
      await waitForOnboardingUpdate(page, currentUrl, 10_000);
      continue;
    }

    await page.waitForTimeout(1000);
  }

  if (isOnboardingPage(page.url())) {
    throw new Error(`Unable to complete onboarding from URL: ${page.url()}`);
  }
}

async function clickIfVisible(page: Page, locator: Locator, timeout: number) {
  if (!(await waitForVisible(locator, timeout))) {
    return false;
  }

  await locator.click();
  await page.waitForTimeout(200);
  return true;
}

async function waitForVisible(locator: Locator, timeout: number) {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

async function waitForOnboardingUpdate(
  page: Page,
  previousUrl: string,
  timeout: number,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const currentUrl = page.url();
    if (!isOnboardingPage(currentUrl)) return;
    if (currentUrl !== previousUrl) return;
    await page.waitForTimeout(250);
  }
}

function isOnboardingPage(url: string) {
  return isOnboardingPath(new URL(url).pathname);
}

function isOnboardingPath(pathname: string) {
  return /^\/[a-z0-9]+\/onboarding\/?$/.test(pathname);
}

function isInterruptedNavigationError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("interrupted by another navigation")
  );
}
