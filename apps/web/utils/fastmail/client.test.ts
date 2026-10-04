import { describe, expect, it, vi, afterEach } from "vitest";
import { checkJMAPErrors, createFastmailClient } from "@/utils/fastmail/client";

vi.mock("@/utils/auth/save-tokens", () => ({ saveTokens: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

describe("JMAP failures", () => {
  it.each([
    "notCreated",
    "notUpdated",
    "notDestroyed",
  ])("rejects per-object %s errors inside a successful HTTP response", (field) => {
    expect(() =>
      checkJMAPErrors({
        sessionState: "session",
        methodResponses: [
          [
            "Email/set",
            {
              [field]: {
                message: {
                  type: "forbidden",
                  description: "Permission denied",
                },
              },
            },
            "0",
          ],
        ],
      }),
    ).toThrow("Permission denied");
  });

  it("does not retry an ambiguous submission after a network failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          capabilities: {
            "urn:ietf:params:jmap:core": {},
            "urn:ietf:params:jmap:mail": {},
          },
          primaryAccounts: { "urn:ietf:params:jmap:mail": "account" },
          apiUrl: "https://api.fastmail.com/jmap/api/",
        }),
      )
      .mockRejectedValue(new Error("Connection lost after submission"));
    vi.stubGlobal("fetch", fetchMock);
    const client = await createFastmailClient("token");
    await expect(
      client.request([
        ["EmailSubmission/set", { accountId: "account", create: {} }, "0"],
      ]),
    ).rejects.toThrow("Connection lost");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
