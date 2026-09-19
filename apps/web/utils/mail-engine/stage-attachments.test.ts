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
    http.request
      .mockResolvedValueOnce({
        status: 200,
        json: { blobId: "file-1" },
      })
      .mockResolvedValueOnce({
        status: 200,
        json: { blobId: "file-1" },
      });

    const content = Buffer.from("hello");
    await expect(
      stageSendAttachments("account", [
        {
          id: "file-1",
          filename: "note.txt",
          content: content.toString("base64"),
          contentType: "text/plain",
        },
      ]),
    ).resolves.toEqual(["file-1"]);
    expect(http.request).toHaveBeenNthCalledWith(
      1,
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
    expect(http.request.mock.calls[0][0].body).not.toHaveProperty("bytes");
    expect(http.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "PUT",
        path: "/api/mail/v1/accounts/account/uploads/file-1/content?protocolVersion=1",
        body: content,
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

  it("fails the send when content PUT is rejected after admit", async () => {
    http.request
      .mockResolvedValueOnce({
        status: 200,
        json: { blobId: "file-1" },
      })
      .mockResolvedValueOnce({
        status: 507,
        json: { error: { code: "too_large" } },
      });
    await expect(
      stageSendAttachments("account", [
        {
          id: "file-1",
          filename: "photo.jpg",
          content: Buffer.from("hello").toString("base64"),
          contentType: "image/jpeg",
        },
      ]),
    ).rejects.toThrow(admissionRejectionCopy("too_large"));
    expect(http.request).toHaveBeenCalledTimes(3);
    expect(http.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "PUT",
        path: "/api/mail/v1/accounts/account/uploads/file-1/content?protocolVersion=1",
      }),
    );
    expect(http.request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: "DELETE",
        path: "/api/mail/v1/accounts/account/uploads/file-1?protocolVersion=1",
      }),
    );
  });

  it("cancels earlier staged uploads when a later PUT is rejected", async () => {
    http.request
      .mockResolvedValueOnce({ status: 200, json: { blobId: "file-1" } })
      .mockResolvedValueOnce({ status: 200, json: { blobId: "file-1" } })
      .mockResolvedValueOnce({ status: 200, json: { blobId: "file-2" } })
      .mockResolvedValueOnce({
        status: 507,
        json: { error: { code: "too_large" } },
      })
      .mockResolvedValue({ status: 200, json: { status: "deleted" } });
    await expect(
      stageSendAttachments("account", [
        {
          id: "file-1",
          filename: "note.txt",
          content: Buffer.from("hello").toString("base64"),
          contentType: "text/plain",
        },
        {
          id: "file-2",
          filename: "photo.jpg",
          content: Buffer.from("world").toString("base64"),
          contentType: "image/jpeg",
        },
      ]),
    ).rejects.toThrow(admissionRejectionCopy("too_large"));
    const deleted = http.request.mock.calls
      .filter((call) => call[0].method === "DELETE")
      .map((call) => call[0].path);
    expect(deleted).toEqual([
      "/api/mail/v1/accounts/account/uploads/file-1?protocolVersion=1",
      "/api/mail/v1/accounts/account/uploads/file-2?protocolVersion=1",
    ]);
  });

  it("cancels an admitted upload when content PUT throws", async () => {
    http.request
      .mockResolvedValueOnce({ status: 200, json: { blobId: "file-1" } })
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue({ status: 200, json: { status: "deleted" } });
    await expect(
      stageSendAttachments("account", [
        {
          id: "file-1",
          filename: "note.txt",
          content: Buffer.from("hello").toString("base64"),
          contentType: "text/plain",
        },
      ]),
    ).rejects.toThrow("network down");
    expect(http.request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: "DELETE",
        path: "/api/mail/v1/accounts/account/uploads/file-1?protocolVersion=1",
      }),
    );
  });

  it("cancels earlier staged uploads when a later admit is rejected", async () => {
    http.request
      .mockResolvedValueOnce({ status: 200, json: { blobId: "file-1" } })
      .mockResolvedValueOnce({ status: 200, json: { blobId: "file-1" } })
      .mockResolvedValueOnce({
        status: 400,
        json: { error: { code: "invalid" } },
      })
      .mockResolvedValue({ status: 200, json: { status: "deleted" } });
    await expect(
      stageSendAttachments("account", [
        {
          id: "file-1",
          filename: "note.txt",
          content: Buffer.from("hello").toString("base64"),
          contentType: "text/plain",
        },
        {
          id: "file-2",
          filename: "photo.jpg",
          content: Buffer.from("world").toString("base64"),
          contentType: "image/jpeg",
        },
      ]),
    ).rejects.toThrow("Could not stage photo.jpg");
    const deleted = http.request.mock.calls
      .filter((call) => call[0].method === "DELETE")
      .map((call) => call[0].path);
    expect(deleted).toEqual([
      "/api/mail/v1/accounts/account/uploads/file-1?protocolVersion=1",
    ]);
  });
});
