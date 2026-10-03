import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import {
  createDraftResource,
  discardDraftResource,
  readDraftResource,
  updateDraftResource,
} from "@/utils/email/draft-resource";
import { GET, POST, PUT, DELETE } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/email/draft-resource", async (original) => ({
  ...(await original<typeof import("@/utils/email/draft-resource")>()),
  createDraftResource: vi.fn(),
  discardDraftResource: vi.fn(),
  readDraftResource: vi.fn(),
  updateDraftResource: vi.fn(),
}));
vi.mock("@/utils/middleware", () => {
  const wrap =
    (
      _name: string,
      handler: (
        request: NextRequest & Record<string, unknown>,
        context: unknown,
      ) => Promise<Response>,
    ) =>
    (request: NextRequest, context: unknown) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "account", userId: "user" },
          emailProvider: { name: "google" },
          logger: createScopedLogger("draft-resource-route-test"),
        }),
        context,
      );
  return { withEmailAccount: wrap, withEmailProvider: wrap };
});

const content = {
  to: '"Recipient, Name" <to@example.test>',
  cc: "cc@example.test",
  bcc: "bcc@example.test",
  subject: "Subject",
  messageHtml: '<p>Body<img src="cid:logo@example.test"></p>',
  attachments: [
    {
      filename: "logo.png",
      content:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2e0AAAAASUVORK5CYII=",
      contentType: "image/png",
      disposition: "inline",
      contentId: "logo@example.test",
    },
  ],
};
const resource = {
  resourceKey: "canonical",
  state: "UNCERTAIN",
  owner: "DRAFT",
  providerDraftId: "known-draft",
  providerMessageId: "message",
  providerThreadId: "thread",
  leaseId: "held",
} as never;
const context = (accountId = "account") =>
  ({
    params: Promise.resolve({ accountId, resourceKey: "local-key" }),
  }) as never;
const request = (method: string, query = "", body: unknown = { content }) =>
  new NextRequest(
    `http://localhost/api/mail/v1/accounts/account/draft-resources/local-key${query}`,
    {
      method,
      headers: {
        "content-type": "application/json",
        "X-Email-Account-ID": "account",
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    },
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readDraftResource).mockResolvedValue(resource);
  vi.mocked(createDraftResource).mockResolvedValue(resource);
  vi.mocked(updateDraftResource).mockResolvedValue(resource);
  vi.mocked(discardDraftResource).mockResolvedValue(resource);
});

it.each([
  GET,
  POST,
  PUT,
  DELETE,
])("rejects account mismatch before resource access", async (handler) => {
  const method =
    handler === GET
      ? "GET"
      : handler === POST
        ? "POST"
        : handler === PUT
          ? "PUT"
          : "DELETE";
  expect((await handler(request(method), context("other"))).status).toBe(403);
  for (const helper of [
    readDraftResource,
    createDraftResource,
    updateDraftResource,
    discardDraftResource,
  ])
    expect(helper).not.toHaveBeenCalled();
});
it.each([
  GET,
  POST,
  PUT,
  DELETE,
])("rejects unsupported protocol before resource access", async (handler) => {
  const method =
    handler === GET
      ? "GET"
      : handler === POST
        ? "POST"
        : handler === PUT
          ? "PUT"
          : "DELETE";
  expect(
    (await handler(request(method, "?protocolVersion=2"), context())).status,
  ).toBe(409);
  for (const helper of [
    readDraftResource,
    createDraftResource,
    updateDraftResource,
    discardDraftResource,
  ])
    expect(helper).not.toHaveBeenCalled();
});
it("reads truthful uncertainty without provider I/O and forbids response caching", async () => {
  const response = await GET(request("GET"), context());
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({
    resourceKey: "canonical",
    state: "UNCERTAIN",
    providerDraftId: "known-draft",
    retryAfterMs: null,
  });
  expect(readDraftResource).toHaveBeenCalledWith("account", "local-key");
  expect(createDraftResource).not.toHaveBeenCalled();
});
it("returns an uncached 404 for an absent resource", async () => {
  vi.mocked(readDraftResource).mockResolvedValue(null);
  const response = await GET(request("GET"), context());
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it.each([
  POST,
  PUT,
])("preserves rich content, recipient identities, and inline attachment metadata", async (handler) => {
  const method = handler === POST ? "POST" : "PUT";
  await handler(
    request(method, "", { content, providerDraftId: "known-draft" }),
    context(),
  );
  const helper = handler === POST ? createDraftResource : updateDraftResource;
  expect(helper).toHaveBeenCalledWith(
    expect.objectContaining({
      accountId: "account",
      resourceKey: "local-key",
      content,
      providerDraftId: "known-draft",
    }),
  );
});
it("discards only the authenticated keyed resource", async () => {
  await DELETE(
    request("DELETE", "", { providerDraftId: "known-draft" }),
    context(),
  );
  expect(discardDraftResource).toHaveBeenCalledWith(
    expect.objectContaining({
      accountId: "account",
      resourceKey: "local-key",
      providerDraftId: "known-draft",
    }),
  );
});
