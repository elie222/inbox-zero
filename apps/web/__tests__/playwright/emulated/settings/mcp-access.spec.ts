import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { expect } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { openSettings } from "./settings-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";

let clientId: string | undefined;

test.afterEach(async () => {
  if (!clientId) return;
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query('DELETE FROM "OauthClient" WHERE "clientId" = $1', [
      clientId,
    ]);
  } finally {
    await db.end();
    clientId = undefined;
  }
});

test("requires client consent, enforces read-only access, and disconnects existing tokens", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(360_000);
  await openSettings(page);
  const developerSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Developer", exact: true }),
  });
  await expect(developerSection.getByText("API Access")).toBeVisible();
  await expect(
    developerSection.getByRole("button", { name: "Connect", exact: true }),
  ).toBeHidden();
  await capturePlaywrightCheckpoint(
    developerSection,
    testInfo,
    "developer-mcp-row",
  );
  const toggle = page.getByRole("switch", { name: "MCP", exact: true });
  await toggle.setChecked(false);
  await expect(toggle).not.toBeChecked();

  const baseURL = process.env.NEXT_PUBLIC_BASE_URL;
  assert(baseURL);
  const resource = `${baseURL}/mcp`;
  const metadata = await request.get("/.well-known/oauth-protected-resource");
  expect((await metadata.json()).resource).toBe(resource);
  const registration = await request.post("/api/auth/oauth2/register", {
    headers: { Origin: baseURL },
    data: {
      client_name: "Playwright MCP client",
      redirect_uris: ["https://client.example.com/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "mcp:read offline_access",
    },
  });
  expect(registration.ok(), await registration.text()).toBe(true);
  clientId = (await registration.json()).client_id;
  assert(clientId);
  const verifier =
    "playwright-pkce-verifier-with-at-least-forty-three-characters";
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://client.example.com/callback",
    response_type: "code",
    scope: "mcp:read offline_access",
    resource,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: "playwright-state",
  });
  await page.route("https://client.example.com/callback**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Connected</h1>" }),
  );
  await page.goto(`/api/auth/oauth2/authorize?${query}`);
  await expect(
    page.getByRole("heading", { name: "Connect Playwright MCP client?" }),
  ).toBeVisible();
  await expect(
    page.getByText("Can search and read mail. Can't send email."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Can search mail, create drafts, and manage rules. Can't send email.",
    ),
  ).toBeHidden();
  await capturePlaywrightCheckpoint(page, testInfo, "mcp-consent");
  await page.getByRole("button", { name: "Allow" }).click();
  await page.waitForURL("https://client.example.com/callback**");
  const callback = new URL(page.url());
  expect(callback.searchParams.get("state")).toBe("playwright-state");
  const code = callback.searchParams.get("code");
  assert(code);
  const response = await request.post("/api/auth/oauth2/token", {
    headers: { Origin: baseURL },
    form: {
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: "https://client.example.com/callback",
      code_verifier: verifier,
      resource,
    },
  });
  expect(response.ok(), response.statusText()).toBe(true);
  const tokens = await response.json();
  const headers = {
    Authorization: `Bearer ${tokens.access_token}`,
    Accept: "application/json, text/event-stream",
  };
  const initialize = await request.post(resource, {
    headers,
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "playwright", version: "1" },
      },
    },
  });
  expect(initialize.ok()).toBe(true);
  const allowed = await request.post(resource, {
    headers,
    data: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_email_accounts", arguments: {} },
    },
  });
  expect((await allowed.json()).result.isError).not.toBe(true);
  const denied = await request.post(resource, {
    headers,
    data: {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "delete_rule", arguments: { id: "not-a-rule" } },
    },
  });
  expect((await denied.json()).result.isError).toBe(true);

  await page.goto("/settings");
  await expect(toggle).toBeChecked();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const connectDialog = page.getByRole("dialog", { name: "Connect MCP" });
  await expect(connectDialog.locator('input[name="copy-input"]')).toHaveValue(
    resource,
  );
  await capturePlaywrightCheckpoint(connectDialog, testInfo, "mcp-connect-url");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^MCP apps/ }).click();
  const appsDialog = page.getByRole("dialog", { name: "MCP apps" });
  await expect(
    appsDialog.getByText("Playwright MCP client", { exact: true }),
  ).toBeVisible();
  await appsDialog
    .getByRole("button", { name: "Disconnect Playwright MCP client" })
    .click();
  await expect(page.getByText("Disconnected", { exact: true })).toBeVisible();
  const disconnected = await request.post(resource, {
    headers,
    data: { jsonrpc: "2.0", id: 4, method: "tools/list" },
  });
  expect(disconnected.status()).toBe(401);
  await page.keyboard.press("Escape");
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(
    page.getByText("MCP access disabled!", { exact: true }),
  ).toBeVisible();
  const revoked = await request.post(resource, {
    headers,
    data: { jsonrpc: "2.0", id: 5, method: "tools/list" },
  });
  expect(revoked.status()).toBe(401);
  await toggle.click();
  await expect(
    page.getByText("MCP access enabled!", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Connect MCP" })).toBeVisible();
  await page.keyboard.press("Escape");
  const stillRevoked = await request.post(resource, {
    headers,
    data: { jsonrpc: "2.0", id: 6, method: "tools/list" },
  });
  expect(stillRevoked.status()).toBe(401);
  await toggle.click();
  await expect(toggle).not.toBeChecked();
});
