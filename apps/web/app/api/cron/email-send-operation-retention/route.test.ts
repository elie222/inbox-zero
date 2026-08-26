import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureExceptionMock, cleanupAttachmentsMock, deleteExpiredMock } =
  vi.hoisted(() => ({
    captureExceptionMock: vi.fn(),
    cleanupAttachmentsMock: vi.fn(),
    deleteExpiredMock: vi.fn(),
  }));

vi.mock("@/env", () => ({
  env: { CRON_SECRET: "cron-secret" },
}));
vi.mock("@/utils/email-send-operation-retention", () => ({
  deleteExpiredEmailSendOperations: () => deleteExpiredMock(),
}));
vi.mock("@/utils/email/email-attachment-staging", () => ({
  cleanupEmailAttachmentStages: () => cleanupAttachmentsMock(),
}));
vi.mock("@/utils/error", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET, POST } from "./route";

describe("email send operation retention cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanupAttachmentsMock.mockResolvedValue({
      deletedBlobs: 2,
      deletedTombstones: 1,
    });
    deleteExpiredMock.mockResolvedValue(3);
  });

  it("rejects requests without the cron bearer token", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/cron/email-send-operation-retention",
      ),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(401);
    expect(deleteExpiredMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledOnce();
  });

  it("deletes expired operations for an authorized GET request", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/cron/email-send-operation-retention",
        { headers: { authorization: "Bearer cron-secret" } },
      ),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      attachments: { deletedBlobs: 2, deletedTombstones: 1 },
      deleted: 3,
    });
    expect(cleanupAttachmentsMock).toHaveBeenCalledOnce();
    expect(deleteExpiredMock).toHaveBeenCalledOnce();
  });

  it("continues operation retention when attachment cleanup fails", async () => {
    const error = new Error("Blob service unavailable");
    cleanupAttachmentsMock.mockRejectedValue(error);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/cron/email-send-operation-retention",
        { headers: { authorization: "Bearer cron-secret" } },
      ),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      attachments: null,
      deleted: 3,
    });
    expect(deleteExpiredMock).toHaveBeenCalledOnce();
    expect(captureExceptionMock).toHaveBeenCalledWith(error);
  });

  it("rejects POST requests without the cron secret", async () => {
    const response = await POST(
      new NextRequest(
        "http://localhost:3000/api/cron/email-send-operation-retention",
        {
          method: "POST",
          body: JSON.stringify({ CRON_SECRET: "wrong-secret" }),
        },
      ),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(401);
    expect(deleteExpiredMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledOnce();
  });

  it("deletes expired operations for an authorized POST request", async () => {
    const response = await POST(
      new NextRequest(
        "http://localhost:3000/api/cron/email-send-operation-retention",
        {
          method: "POST",
          body: JSON.stringify({ CRON_SECRET: "cron-secret" }),
        },
      ),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      attachments: { deletedBlobs: 2, deletedTombstones: 1 },
      deleted: 3,
    });
    expect(cleanupAttachmentsMock).toHaveBeenCalledOnce();
    expect(deleteExpiredMock).toHaveBeenCalledOnce();
  });
});
