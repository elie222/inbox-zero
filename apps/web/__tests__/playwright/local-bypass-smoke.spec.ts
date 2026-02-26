import { expect, test, type Locator, type Page } from "@playwright/test";

test("local bypass completes onboarding and reaches app pages", async ({
  page,
}) => {
  await page.goto("/login?next=%2Fwelcome-redirect%3Fforce%3Dtrue");

  const bypassLoginButton = page.getByRole("button", {
    name: "Bypass login (local only)",
  });
  await expect(bypassLoginButton).toBeVisible();
  await bypassLoginButton.click();

  await page.waitForURL((url) => isOnboardingPath(url.pathname), {
    timeout: 60_000,
  });

  const emailAccountId = getEmailAccountIdFromUrl(page.url());

  await completeOnboardingFlow(page);
  await expect(page).toHaveURL(
    /\/(?:welcome-upgrade|[a-z0-9]+\/setup)(?:\?.*)?$/,
  );

  const labelsResponse = await page.request.get("/api/labels", {
    headers: {
      "X-Email-Account-ID": emailAccountId,
    },
  });
  expect(labelsResponse.ok()).toBeTruthy();

  const labelsPayload = (await labelsResponse.json()) as {
    labels: { name: string }[];
  };
  const labelNames = labelsPayload.labels.map((label) => label.name);
  expect(labelNames).toContain("Newsletter");
  expect(labelNames).toContain("Receipts");

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

function getEmailAccountIdFromUrl(url: string) {
  const pathname = new URL(url).pathname;
  const matches = pathname.match(/^\/([^/]+)\/onboarding(?:\/)?$/);
  if (!matches?.[1]) {
    throw new Error(`Unable to parse email account ID from URL: ${url}`);
  }
  return matches[1];
}

async function completeOnboardingFlow(page: Page) {
  const maxSteps = 25;

  for (let step = 0; step < maxSteps; step++) {
    if (!isOnboardingPage(page.url())) {
      return;
    }

    if (
      await clickIfVisible(
        page,
        page.getByRole("button", { name: /^Founder\b/ }),
        1000,
      )
    ) {
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
      continue;
    }

    if (
      await clickIfVisible(
        page,
        page.getByRole("button", { name: "No, thanks" }),
        1000,
      )
    ) {
      continue;
    }

    if (
      await clickIfVisible(
        page,
        page.getByRole("button", { name: "Skip" }),
        1000,
      )
    ) {
      continue;
    }

    if (
      await clickIfVisible(
        page,
        page.getByRole("button", { name: /^Continue\b/ }),
        5000,
      )
    ) {
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

function isOnboardingPage(url: string) {
  return isOnboardingPath(new URL(url).pathname);
}

function isOnboardingPath(pathname: string) {
  return /^\/[a-z0-9]+\/onboarding\/?$/.test(pathname);
}
