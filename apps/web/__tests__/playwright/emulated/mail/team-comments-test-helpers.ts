import { randomUUID } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { playwrightMailProvider } from "../mail-provider";
import { getEmailAccount } from "../account-test-helpers";
import { withClient } from "./mail-test-helpers";

export function teammateEmail(role: "b" | "c" | "d") {
  const publisherEmail = process.env.PLAYWRIGHT_TEST_EMAIL;
  if (!publisherEmail) throw new Error("PLAYWRIGHT_TEST_EMAIL is required");
  return publisherEmail.replace("playwright-test", `playwright-team-${role}`);
}

export async function signInTeammate(browser: Browser, role: "b" | "c" | "d") {
  const email = teammateEmail(role);
  const context = await browser.newContext({
    baseURL: process.env.NEXT_PUBLIC_BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const signIn = await page.evaluate(async (provider) => {
    const response = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider,
        callbackURL: "/welcome-redirect?force=true",
        errorCallbackURL: "/login/error",
      }),
    });
    if (!response.ok)
      throw new Error(`OAuth sign-in failed: ${response.status}`);
    return response.json() as Promise<{ url: string }>;
  }, playwrightMailProvider);
  await page.goto(signIn.url);
  await page.getByRole("button", { name: email }).click();
  await expect
    .poll(() => page.url(), { timeout: 30_000 })
    .toContain(process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000");
  await withClient(async (client) => {
    await client.query(
      `UPDATE "User" SET "completedOnboardingAt" = CURRENT_TIMESTAMP WHERE email = $1`,
      [email],
    );
    await client.query(
      `UPDATE "EmailAccount" SET "behaviorProfile" = '{}'::jsonb, "personaAnalysis" = '{}'::jsonb WHERE email = $1`,
      [email],
    );
  });
  const account = await getEmailAccount(page);
  expect(account.email).toBe(email);
  return { context, page, account };
}

export async function seedTeam(
  publisherPage: Page,
  teammates: Array<{ role: "b" | "c" | "d"; account: { id: string } }>,
) {
  const publisher = await getEmailAccount(publisherPage);
  const organizationId = randomUUID();
  const foreignOrganizationId = randomUUID();
  const publisherMemberId = randomUUID();
  const memberIds: Record<string, string> = {};
  const extraAccountId = randomUUID();
  await withClient(async (client) => {
    const publisherUser = await client.query<{ userId: string }>(
      `SELECT "userId" FROM "EmailAccount" WHERE id = $1`,
      [publisher.id],
    );
    const userId = publisherUser.rows[0]?.userId;
    if (!userId) throw new Error("Publisher account missing");
    const extraAccountRecordId = randomUUID();
    await client.query(
      `INSERT INTO "Account" (id, "userId", provider, "providerAccountId", type, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, 'oauth', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [extraAccountRecordId, userId, playwrightMailProvider, extraAccountId],
    );
    await client.query(
      `INSERT INTO "EmailAccount" (id, email, "userId", "accountId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        extraAccountId,
        `extra-${extraAccountId}@example.com`,
        userId,
        extraAccountRecordId,
      ],
    );
    await client.query(
      `INSERT INTO "Organization" (id, name, slug, "createdAt", "updatedAt") VALUES ($1, 'Team comments test', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ($2, 'Foreign team', $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [organizationId, foreignOrganizationId],
    );
    await client.query(
      `INSERT INTO "Member" (id, "organizationId", "emailAccountId", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [publisherMemberId, organizationId, publisher.id],
    );
    for (const teammate of teammates) {
      const memberId = randomUUID();
      memberIds[teammate.role] = memberId;
      await client.query(
        `INSERT INTO "Member" (id, "organizationId", "emailAccountId", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          memberId,
          teammate.role === "d" ? foreignOrganizationId : organizationId,
          teammate.account.id,
          teammate.role === "c" ? "admin" : "member",
        ],
      );
    }
  });
  return {
    publisher,
    publisherMemberId,
    memberIds,
    organizationId,
    foreignOrganizationId,
    extraAccountId,
    async cleanup() {
      await withClient(async (client) => {
        await client.query(`DELETE FROM "Organization" WHERE id IN ($1, $2)`, [
          organizationId,
          foreignOrganizationId,
        ]);
        await client.query(`DELETE FROM "EmailAccount" WHERE id = $1`, [
          extraAccountId,
        ]);
        await client.query(
          `DELETE FROM "Account" WHERE "providerAccountId" = $1`,
          [extraAccountId],
        );
        await client.query(`DELETE FROM "User" WHERE email = ANY($1::text[])`, [
          teammates.map((teammate) => teammateEmail(teammate.role)),
        ]);
      });
    },
  };
}

export async function readSharedConversationId(
  page: Page,
  memberId: string,
  accountId: string,
) {
  const response = await page.request.get(
    `/api/team-comments/conversations?memberId=${memberId}&emailAccountId=${accountId}&providerConversationId=thr_playwright_reader`,
  );
  expect(response.ok(), await response.text()).toBe(true);
  const data = (await response.json()) as { source: { id: string } | null };
  expect(data.source).toBeTruthy();
  return data.source!.id;
}

export async function expectSharedMessageBody(
  page: Page,
  text: string,
  timeout = 60_000,
) {
  await expect
    .poll(
      async () => {
        if ((await page.getByText(text).count()) > 0) return true;
        const frames = page.locator(
          'main iframe[title="Email content preview"]',
        );
        const count = await frames.count();
        for (let index = 0; index < count; index++) {
          if (
            (await frames.nth(index).contentFrame().getByText(text).count()) > 0
          )
            return true;
        }
        return false;
      },
      { timeout },
    )
    .toBe(true);
}

export async function readPublisherThread(
  page: Page,
  emailAccountId: string,
  providerConversationId: string,
) {
  const token = await withClient(async (client) => {
    const result = await client.query<{ access_token: string | null }>(
      `SELECT a.access_token FROM "EmailAccount" e
       JOIN "Account" a ON a.id = e."accountId"
       WHERE e.id = $1`,
      [emailAccountId],
    );
    return result.rows[0]?.access_token;
  });
  if (!token) throw new Error("Publisher provider token unavailable");
  const headers = { Authorization: `Bearer ${token}` };
  if (playwrightMailProvider === "google") {
    const baseUrl = process.env.GOOGLE_BASE_URL;
    if (!baseUrl) throw new Error("GOOGLE_BASE_URL is missing");
    const response = await page.request.get(
      `${baseUrl}/gmail/v1/users/me/threads/${encodeURIComponent(providerConversationId)}`,
      { headers },
    );
    expect(response.ok(), await response.text()).toBe(true);
    const thread = (await response.json()) as {
      messages: Array<{
        labelIds?: string[];
        snippet?: string;
        payload?: {
          headers?: Array<{ name: string; value: string }>;
          body?: { data?: string };
          parts?: Array<{ body?: { data?: string } }>;
        };
      }>;
    };
    return thread.messages
      .filter((message) => !message.labelIds?.includes("DRAFT"))
      .map((message) => ({
        to:
          message.payload?.headers?.find(
            (header) => header.name.toLowerCase() === "to",
          )?.value ?? "",
        body: [
          message.snippet ?? "",
          message.payload?.body?.data
            ? Buffer.from(message.payload.body.data, "base64url").toString(
                "utf8",
              )
            : "",
          ...(message.payload?.parts ?? []).map((part) =>
            part.body?.data
              ? Buffer.from(part.body.data, "base64url").toString("utf8")
              : "",
          ),
        ].join(" "),
      }));
  }
  const baseUrl = process.env.MICROSOFT_BASE_URL;
  if (!baseUrl) throw new Error("MICROSOFT_BASE_URL is missing");
  const response = await page.request.get(
    `${baseUrl}/v1.0/me/messages?$top=100`,
    { headers },
  );
  expect(response.ok(), await response.text()).toBe(true);
  const pageData = (await response.json()) as {
    value: Array<{
      conversationId: string;
      isDraft?: boolean;
      toRecipients?: Array<{ emailAddress?: { address?: string } }>;
      body?: { content?: string };
      bodyTextContent?: string;
    }>;
  };
  return pageData.value
    .filter(
      (message) =>
        message.conversationId === providerConversationId && !message.isDraft,
    )
    .map((message) => ({
      to:
        message.toRecipients
          ?.map((recipient) => recipient.emailAddress?.address ?? "")
          .join(", ") ?? "",
      body: `${message.body?.content ?? ""} ${message.bodyTextContent ?? ""}`,
    }));
}
