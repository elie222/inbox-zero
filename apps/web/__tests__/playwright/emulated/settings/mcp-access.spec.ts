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
  const toggle = page.getByRole("switch", { name: "MCP", exact: true });
  await expect(toggle).not.toBeChecked();

  const baseURL = process.env.NEXT_PUBLIC_BASE_URL!;
  const resource = `${baseURL}/api/mcp-server`;
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
  const verifier =
    "playwright-pkce-verifier-with-at-least-forty-three-characters";
  const query = new URLSearchParams({
    client_id: clientId!,
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
    page.getByText(
      "View your linked inboxes, automation rules, and email statistics.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Create, replace, and delete automation rules."),
  ).toBeHidden();
  await capturePlaywrightCheckpoint(page, testInfo, "mcp-consent");
  await page.getByRole("button", { name: "Enable MCP and allow" }).click();
  await page.waitForURL("https://client.example.com/callback**");
  const callback = new URL(page.url());
  expect(callback.searchParams.get("state")).toBe("playwright-state");
  const response = await request.post("/api/auth/oauth2/token", {
    headers: { Origin: baseURL },
    form: {
      grant_type: "authorization_code",
      code: callback.searchParams.get("code")!,
      client_id: clientId!,
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
  await toggle.click();
  await expect(
    page.getByText("MCP access disabled!", { exact: true }),
  ).toBeVisible();
  const revoked = await request.post(resource, {
    headers,
    data: { jsonrpc: "2.0", id: 4, method: "tools/list" },
  });
  expect(revoked.status()).toBe(401);
  await toggle.click();
  await expect(
    page.getByText("MCP access enabled!", { exact: true }),
  ).toBeVisible();
  const stillRevoked = await request.post(resource, {
    headers,
    data: { jsonrpc: "2.0", id: 5, method: "tools/list" },
  });
  expect(stillRevoked.status()).toBe(401);
  await toggle.click();
  await expect(toggle).not.toBeChecked();
});
