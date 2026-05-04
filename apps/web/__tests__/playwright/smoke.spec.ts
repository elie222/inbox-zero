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

  await page.goto("/onboarding?step=welcome&force=true");

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
  const maxSteps = 20;

  for (let step = 0; step < maxSteps; step++) {
    const currentUrl = page.url();
    if (!isOnboardingPage(currentUrl)) {
      return;
    }

    if (await completeCurrentOnboardingStep(page, currentUrl)) {
      await waitForOnboardingUpdate(page, currentUrl, 10_000);
      continue;
    }

    await page.waitForTimeout(1000);
  }

  if (isOnboardingPage(page.url())) {
    throw new Error(`Unable to complete onboarding from URL: ${page.url()}`);
  }
}

async function completeCurrentOnboardingStep(page: Page, currentUrl: string) {
  if (
    await clickStepButton(page, "What do you do?", /^Founder\b/, currentUrl)
  ) {
    return clickIfVisible(
      page,
      page.getByRole("button", { name: /^Continue\b/ }),
      5000,
    );
  }

  const stepActions = [
    {
      heading: "Your inbox, automatically sorted",
      button: /^Continue\b/,
    },
    {
      heading: "A chat that runs your email",
      button: /^Continue\b/,
    },
    {
      heading: "Drafts ready to send",
      button: /^Continue\b/,
    },
    {
      heading: "Bulk unsubscribe and archive",
      button: /^Continue\b/,
    },
    {
      heading: "What's the size of your company?",
      button: "Only me",
    },
    {
      heading: "How did you hear about Inbox Zero?",
      button: "Search",
    },
    {
      heading: "How do you want your inbox organized?",
      button: /^Continue\b/,
    },
    {
      heading: "Should we draft replies for you?",
      button: "No, thanks",
    },
    {
      heading: "Custom rules",
      button: /^Continue\b/,
    },
    {
      heading: "Invite your team",
      button: "Skip",
    },
    {
      heading: "Labels and drafts are ready",
      button: /^Continue\b/,
    },
  ] satisfies { heading: string; button: string | RegExp }[];

  for (const { heading, button } of stepActions) {
    if (await clickStepButton(page, heading, button, currentUrl)) {
      return true;
    }
  }

  return false;
}

async function clickStepButton(
  page: Page,
  heading: string,
  button: string | RegExp,
  currentUrl: string,
) {
  if (
    !(await waitForVisible(page.getByRole("heading", { name: heading }), 250))
  ) {
    return false;
  }

  const clicked = await clickIfVisible(
    page,
    page.getByRole("button", { name: button }),
    5000,
  );

  if (!clicked) {
    throw new Error(
      `Unable to complete onboarding step "${heading}" from URL: ${currentUrl}`,
    );
  }

  return true;
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
