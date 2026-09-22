import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { getSharedAttachment } from "@/utils/team-comments/content";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/team-comments/content", () => ({
  getSharedAttachment: vi.fn(),
}));
vi.mock("@/utils/middleware", () => ({
  withAuth:
    (
      _name: string,
      handler: (
        request: NextRequest & Record<string, unknown>,
        context: {
          params: Promise<{ conversationId: string; attachmentRef: string }>;
        },
      ) => Promise<Response>,
    ) =>
    (
      request: NextRequest,
      context: {
        params: Promise<{ conversationId: string; attachmentRef: string }>;
      },
    ) =>
      handler(
        Object.assign(request, {
          auth: { userId: "user" },
          logger: createScopedLogger("team-attachment-test"),
        }),
        context,
      ),
}));

describe("shared attachment response", () => {
  beforeEach(() => vi.clearAllMocks());

  test("serves a Unicode filename with an ASCII fallback and UTF-8 parameter", async () => {
    vi.mocked(getSharedAttachment).mockResolvedValue({
      stream: new ReadableStream(),
      filename: "résumé_日本語📎.pdf",
      mimeType: "application/pdf",
      size: 0,
    });
    const response = await GET(
      new NextRequest(
        "http://localhost/api/team-comments/conversations/share/attachments/0:0?memberId=member",
      ),
      {
        params: Promise.resolve({
          conversationId: "share",
          attachmentRef: "0:0",
        }),
      } as never,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="r_sum_______.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9_%E6%97%A5%E6%9C%AC%E8%AA%9E%F0%9F%93%8E.pdf`,
    );
  });
});
