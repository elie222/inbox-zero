import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mockEmailProvider = vi.hoisted(() => ({
  getMessagesBatch: vi.fn(),
}));

vi.mock("@/utils/middleware", () => ({
  withEmailProvider:
    (_name: string, handler: (request: any) => Promise<Response>) =>
    (request: NextRequest) =>
      handler({
        ...request,
        url: request.url,
        emailProvider: mockEmailProvider,
      }),
}));

describe("GET /api/messages/batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses HTML content as the parsed plain text fallback", async () => {
    mockEmailProvider.getMessagesBatch.mockResolvedValue([
      {
        id: "message-1",
        threadId: "thread-1",
        textPlain: "",
        textHtml:
          '<div>Sent reply body.</div><br><div class="gmail_quote">Previous message</div>',
      },
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/messages/batch?ids=message-1&parseReplies=true",
      ),
    );

    const body = await response.json();

    expect(body.messages[0].textPlain).toBe("Sent reply body.");
  });
});
