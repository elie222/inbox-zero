import { beforeEach, describe, expect, it, vi } from "vitest";
import { stageSendAttachments } from "./stage-attachments";
import { admissionRejectionCopy } from "./admission-notice";

const http = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/utils/mail-engine/http", () => ({
  createMailHttpRequest: () => http.request,
}));

describe("stageSendAttachments", () => {
  beforeEach(() => {
    http.request.mockReset();
  });

  it("returns no ids when there are no attachments", async () => {
    await expect(stageSendAttachments("account", [])).resolves.toEqual([]);
    expect(http.request).not.toHaveBeenCalled();
  });

  it("uploads each attachment and returns staged blob ids", async () => {
    http.request.mockResolvedValue({
      status: 200,
      json: { blobId: "blob-1" },
    });

    await expect(
      stageSendAttachments("account", [
        {
          id: "file-1",
          filename: "note.txt",
          content: Buffer.from("hello").toString("base64"),
          contentType: "text/plain",
        },
      ]),
    ).resolves.toEqual(["blob-1"]);
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/mail/v1/accounts/account/uploads",
        body: expect.objectContaining({
          uploadId: "file-1",
          filename: "note.txt",
          contentType: "text/plain",
        }),
      }),
    );
  });

  it("fails the send when staging is rejected", async () => {
    http.request.mockResolvedValue({ status: 400, json: { error: "invalid" } });
    await expect(
      stageSendAttachments("account", [
        {
          filename: "note.txt",
          content: Buffer.from("hello").toString("base64"),
          contentType: "text/plain",
        },
      ]),
    ).rejects.toThrow("Could not stage note.txt");
  });

  it("explains disk pressure when staging is too_large", async () => {
    http.request.mockResolvedValue({
      status: 507,
      json: { error: { code: "too_large" } },
    });
    await expect(
      stageSendAttachments("account", [
        {
          filename: "photo.jpg",
          content: Buffer.from("hello").toString("base64"),
          contentType: "image/jpeg",
        },
      ]),
    ).rejects.toThrow(admissionRejectionCopy("too_large"));
  });
});
