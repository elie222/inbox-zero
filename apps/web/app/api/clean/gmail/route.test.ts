import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/utils/__mocks__/prisma";
import { GmailLabel } from "@/utils/gmail/label";
import { CleanAction } from "@/generated/prisma/enums";

vi.mock("@/utils/prisma");

const { cleanerEnv } = vi.hoisted(() => ({
  cleanerEnv: {
    NEXT_PUBLIC_CLEANER_ENABLED: true,
  },
}));

vi.mock("@/env", () => ({
  env: cleanerEnv,
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware({ handleSafeErrors: true });
});

vi.mock("@/utils/qstash", () => ({
  withQstashOrInternal: (handler: unknown) => handler,
}));

const mockGetGmailClientWithRefresh = vi.fn();
vi.mock("@/utils/gmail/client", () => ({
  getGmailClientWithRefresh: (...args: unknown[]) =>
    mockGetGmailClientWithRefresh(...args),
}));

const mockGetThread = vi.fn();
const mockUpdateThread = vi.fn();
vi.mock("@/utils/redis/clean", () => ({
  getThread: (...args: unknown[]) => mockGetThread(...args),
  updateThread: (...args: unknown[]) => mockUpdateThread(...args),
}));

const mockLabelThread = vi.fn();
vi.mock("@/utils/gmail/label", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/utils/gmail/label")>();
  return {
    ...original,
    labelThread: (...args: unknown[]) => mockLabelThread(...args),
  };
});

import { POST } from "./route";

function getBody(overrides: Record<string, unknown> = {}) {
  return {
    emailAccountId: "email-account-id",
    threadId: "thread-1",
    markDone: true,
    action: CleanAction.ARCHIVE,
    labelId: "label-finance",
    labelName: "Finance",
    labelAdded: true,
    markedDoneLabelId: "marked-done-label",
    processedLabelId: "processed-label",
    jobId: "job-1",
    ...overrides,
  };
}

function getRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/clean/gmail", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/clean/gmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      id: "email-account-id",
      account: {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_at: new Date(Date.now() + 3_600_000),
      },
    } as any);

    mockGetGmailClientWithRefresh.mockResolvedValue({});
    mockGetThread.mockResolvedValue(undefined);
    mockUpdateThread.mockResolvedValue(undefined);
    mockLabelThread.mockResolvedValue(undefined);
  });

  it("applies the AI label and persists its labelId", async () => {
    const response = await POST(getRequest(getBody()));

    expect(response.status).toBe(200);

    expect(mockLabelThread).toHaveBeenCalledWith({
      gmail: {},
      threadId: "thread-1",
      addLabelIds: ["processed-label", "marked-done-label"],
      removeLabelIds: [GmailLabel.INBOX],
    });

    expect(mockLabelThread).toHaveBeenCalledWith({
      gmail: {},
      threadId: "thread-1",
      addLabelIds: ["label-finance"],
      removeLabelIds: [],
    });

    expect(mockUpdateThread).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      jobId: "job-1",
      threadId: "thread-1",
      update: { status: "completed" },
    });

    expect(prisma.cleanupThread.create).toHaveBeenCalledWith({
      data: {
        emailAccount: { connect: { id: "email-account-id" } },
        threadId: "thread-1",
        archived: true,
        label: "Finance",
        labelId: "label-finance",
        labelAdded: true,
        job: { connect: { id: "job-1" } },
      },
    });
  });

  it("reverts the action when the thread was undone while the job was in flight", async () => {
    mockGetThread.mockResolvedValue({
      threadId: "thread-1",
      jobId: "job-1",
      archive: false,
      label: null,
      undone: true,
      status: "processing",
    });

    const response = await POST(getRequest(getBody()));

    expect(response.status).toBe(200);

    // No core label application: the undo already moved the thread back
    expect(mockLabelThread).toHaveBeenCalledTimes(1);
    expect(mockLabelThread).toHaveBeenCalledWith({
      gmail: {},
      threadId: "thread-1",
      addLabelIds: [],
      removeLabelIds: ["label-finance"],
    });

    expect(mockUpdateThread).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      jobId: "job-1",
      threadId: "thread-1",
      update: { status: "completed", label: null },
    });

    expect(prisma.cleanupThread.create).toHaveBeenCalledWith({
      data: {
        emailAccount: { connect: { id: "email-account-id" } },
        threadId: "thread-1",
        archived: false,
        label: undefined,
        labelId: undefined,
        job: { connect: { id: "job-1" } },
      },
    });
  });

  it("does not clear the label when the thread has no AI label", async () => {
    const response = await POST(getRequest(getBody({ labelId: undefined })));

    expect(response.status).toBe(200);

    expect(mockLabelThread).toHaveBeenCalledTimes(1);

    expect(mockUpdateThread).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      jobId: "job-1",
      threadId: "thread-1",
      update: { status: "completed" },
    });
  });

  it("keeps a pre-existing label when the thread was undone while in flight", async () => {
    mockGetThread.mockResolvedValue({
      threadId: "thread-1",
      jobId: "job-1",
      archive: false,
      label: null,
      undone: true,
      status: "processing",
    });

    const response = await POST(getRequest(getBody({ labelAdded: false })));

    expect(response.status).toBe(200);

    // The label was already on the thread before this run, so the in-flight
    // undo must not remove it: Gmail's add was a no-op and the run never
    // actually added the label.
    expect(mockLabelThread).toHaveBeenCalledTimes(1);
    expect(mockLabelThread).toHaveBeenCalledWith({
      gmail: {},
      threadId: "thread-1",
      addLabelIds: [],
      removeLabelIds: [],
    });
  });

  it("returns 200 and records no label when applying the AI label fails", async () => {
    mockLabelThread
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("stale label"));

    const response = await POST(getRequest(getBody()));

    expect(response.status).toBe(200);

    // The core action still succeeded; only the best-effort AI label failed
    expect(mockLabelThread).toHaveBeenCalledTimes(2);

    // Redis must not keep the optimistic label, and the DB row must not
    // record a label Gmail never got
    expect(mockUpdateThread).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      jobId: "job-1",
      threadId: "thread-1",
      update: { status: "completed", label: null },
    });

    expect(prisma.cleanupThread.create).toHaveBeenCalledWith({
      data: {
        emailAccount: { connect: { id: "email-account-id" } },
        threadId: "thread-1",
        archived: true,
        label: undefined,
        labelId: undefined,
        job: { connect: { id: "job-1" } },
      },
    });
  });
});
