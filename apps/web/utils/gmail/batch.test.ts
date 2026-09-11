import { afterEach, describe, expect, it, vi } from "vitest";
import { getBatch } from "./batch";

vi.mock("@/utils/google/oauth", () => ({
  getGoogleGmailBatchUrl: () => "https://example.com/batch/gmail/v1",
}));

describe("getBatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prevents message IDs from injecting multipart subrequests", async () => {
    const validId = "18f4c6b280d6f124";
    const injectedId =
      "message-id\r\n\r\n--batch_boundary\r\nContent-Type: application/http\r\n\r\nGET /gmail/v1/users/me/messages/injected";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        '--response_boundary\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"id":"18f4c6b280d6f124"}\r\n--response_boundary--',
        {
          headers: {
            "Content-Type": "multipart/mixed; boundary=response_boundary",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getBatch(
      [validId, injectedId],
      "/gmail/v1/users/me/messages",
      "access-token",
    );

    const requestBody = fetchMock.mock.calls[0]?.[1]?.body as string;

    expect(requestBody).toContain(
      `GET /gmail/v1/users/me/messages/${validId}\n\n`,
    );
    expect(requestBody).toContain(
      `GET /gmail/v1/users/me/messages/${encodeURIComponent(injectedId)}\n\n`,
    );
    expect(requestBody.match(/^GET /gm)).toHaveLength(2);
    expect(requestBody).not.toContain(
      "\r\nGET /gmail/v1/users/me/messages/injected",
    );
  });
});
