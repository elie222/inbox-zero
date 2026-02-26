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

  await expect(page).toHaveURL(/\/[a-z0-9]+\/onboarding(\?.*)?$/);
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
  await continueFromStep(page, /Welcome to/i);
  await continueFromStep(page, "We sort your emails");
  await continueFromStep(page, "Pre-drafted replies");
  await continueFromStep(page, "Bulk Unsubscriber & Archiver");
  await continueFromStep(page, /How would you like to use/i);

  await expect(
    page.getByRole("heading", { name: "Let's understand how you use email" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Founder\b/ }).click();
  await page.getByRole("button", { name: /^Continue\b/ }).click();

  await expect(
    page.getByRole("heading", { name: "What's the size of your company?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Only me" }).click();

  await continueFromStep(page, "How do you want your inbox organized?");

  await expect(
    page.getByRole("heading", { name: "Should we draft replies for you?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "No, thanks" }).click();

  await continueFromStep(page, "Custom rules");

  if (await waitForVisible(page.getByRole("button", { name: "Skip" }), 5000)) {
    await page.getByRole("button", { name: "Skip" }).click();
  }

  await continueFromStep(page, "Inbox Preview Ready");
}

async function continueFromStep(page: Page, heading: string | RegExp) {
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await page.getByRole("button", { name: /^Continue\b/ }).click();
}

async function waitForVisible(locator: Locator, timeout: number) {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}
