import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const completeEmailAttachments = vi.hoisted(() => vi.fn());
const stagingErrors = vi.hoisted(() => ({
  Consumed: class EmailAttachmentStageConsumedError extends Error {},
  Incomplete: class EmailAttachmentStageIncompleteError extends Error {},
  Invalid: class EmailAttachmentStageInvalidError extends Error {},
}));

vi.mock("@/utils/email/email-attachment-staging", () => ({
  completeEmailAttachments,
  EmailAttachmentStageConsumedError: stagingErrors.Consumed,
  EmailAttachmentStageIncompleteError: stagingErrors.Incomplete,
  EmailAttachmentStageInvalidError: stagingErrors.Invalid,
}));
vi.mock("@/utils/middleware", () => ({
  withEmailAccount:
    (_name: string, handler: (request: MockedRequest) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "account-1" },
        }) as MockedRequest,
      ),
}));

type MockedRequest = NextRequest & { auth: { emailAccountId: string } };

describe("POST /api/messages/send-attachments/complete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("verifies opaque IDs inside the authenticated account scope", async () => {
    completeEmailAttachments.mockResolvedValue({
      attachments: [
        { id: "attachment-1", stageId: "stage-1", status: "ready" },
      ],
    });
    const input = {
      mutationId: "41ec6d2b-d0e8-4f75-924a-f6f4e5bab4cf",
      attachments: [{ id: "attachment-1", stageId: "stage-1" }],
    };

    const response = await POST(
      new NextRequest(
        "http://localhost/api/messages/send-attachments/complete",
        {
          method: "POST",
          body: JSON.stringify(input),
          headers: { "content-type": "application/json" },
        },
      ),
      { params: Promise.resolve({}) },
    );

    await expect(response.json()).resolves.toEqual({
      attachments: [
        { id: "attachment-1", stageId: "stage-1", status: "ready" },
      ],
    });
    expect(completeEmailAttachments).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      input,
    });
  });

  it.each([
    [new stagingErrors.Incomplete("Upload incomplete"), 409],
    [new stagingErrors.Consumed("Upload expired"), 410],
    [new stagingErrors.Invalid("Upload invalid"), 410],
  ])("maps staging lifecycle failures to a retryable status", async (error, status) => {
    completeEmailAttachments.mockRejectedValue(error);

    const response = await post();

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: error.message });
  });
});

function post() {
  return POST(
    new NextRequest("http://localhost/api/messages/send-attachments/complete", {
      method: "POST",
      body: JSON.stringify({
        mutationId: "41ec6d2b-d0e8-4f75-924a-f6f4e5bab4cf",
        attachments: [{ id: "attachment-1", stageId: "stage-1" }],
      }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({}) },
  );
}
