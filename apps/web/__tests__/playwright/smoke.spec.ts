import { expect, test, type Locator, type Page } from "@playwright/test";

const SMOKE_TEST_EMAIL = process.env.SMOKE_TEST_EMAIL || "smoke-test@gmail.com";
const APP_BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3100";

test("google emulator completes onboarding and reaches app pages", async ({
  page,
}) => {
  await page.goto("/login?next=%2Fwelcome-redirect%3Fforce%3Dtrue");
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();

  const signInPayload = await page.evaluate(async () => {
    const response = await fetch("/api/auth/sign-in/oauth2", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        providerId: "google",
        callbackURL: "/welcome-redirect?force=true",
        errorCallbackURL: "/login/error",
      }),
    });

    if (!response.ok) {
      throw new Error(`OAuth sign-in failed with status ${response.status}`);
    }

    return (await response.json()) as { url: string };
  });

  await page.goto(signInPayload.url);

  await expect(page).toHaveURL(/\/o\/oauth2\/v2\/auth(?:\?.*)?$/);
  await page.getByRole("button", { name: SMOKE_TEST_EMAIL }).click();

  await expect
    .poll(() => page.url(), {
      timeout: 30_000,
    })
    .toContain(APP_BASE_URL);

  await page.goto("/onboarding?step=1&force=true");

  await expect
    .poll(() => isOnboardingPage(page.url()), {
      timeout: 60_000,
    })
    .toBeTruthy();

  await completeOnboardingFlow(page);
  await expect(page).toHaveURL(
    /\/(?:welcome-upgrade|[a-z0-9]+\/setup)(?:\?.*)?$/,
  );
});

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

  try {
    await locator.click({ timeout });
  } catch {
    return false;
  }
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
