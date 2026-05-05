import { beforeEach, describe, expect, it, vi } from "vitest";

const { auditContext, isAuditLoggingEnabledMock, recordAuditEventMock } =
  vi.hoisted(() => ({
    auditContext: {
      value: {
        actorType: "email_account",
        emailAccountId: "email-account-1",
        requestId: "request-1",
        source: "user/rules",
        userId: "user-1",
      },
    },
    isAuditLoggingEnabledMock: vi.fn(() => true),
    recordAuditEventMock: vi.fn(),
  }));

vi.mock("@/env", () => ({
  env: { NODE_ENV: "test" },
}));

vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    defineExtension: (fn: unknown) => fn,
  },
}));

vi.mock("@/utils/audit/context", () => ({
  getAuditContext: () => auditContext.value,
}));

vi.mock("@/utils/audit/delivery", () => ({
  isAuditLoggingEnabled: isAuditLoggingEnabledMock,
  recordAuditEvent: recordAuditEventMock,
}));

import { __testing__ } from "@/utils/audit/prisma-extension";

const { auditPrismaOperation, classifyOperation, getResultCount } = __testing__;

describe("audit Prisma extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuditLoggingEnabledMock.mockReturnValue(true);
    auditContext.value = {
      actorType: "email_account",
      emailAccountId: "email-account-1",
      requestId: "request-1",
      source: "user/rules",
      userId: "user-1",
    };
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_REGION;
    delete process.env.AWS_REGION;
  });

  it("classifies Prisma operations", () => {
    expect(classifyOperation("findMany")).toBe("read");
    expect(classifyOperation("count")).toBe("read");
    expect(classifyOperation("update")).toBe("write");
    expect(classifyOperation("deleteMany")).toBe("write");
    expect(classifyOperation("runCommandRaw")).toBe("other");
  });

  it("derives result counts without inspecting row contents", () => {
    expect(getResultCount([{ id: "1" }, { id: "2" }])).toBe(2);
    expect(getResultCount({ count: 7 })).toBe(7);
    expect(getResultCount(3)).toBe(3);
    expect(getResultCount({ id: "1" })).toBe(1);
    expect(getResultCount(null)).toBe(0);
    expect(getResultCount(undefined)).toBe(0);
  });

  it("records successful read metadata", async () => {
    const query = vi.fn().mockResolvedValue([{ id: "row-1" }]);

    const result = await auditPrismaOperation({
      args: { where: { email: "private@example.com" } },
      model: "User",
      operation: "findMany",
      query,
    });

    expect(result).toEqual([{ id: "row-1" }]);
    expect(query).toHaveBeenCalledWith({
      where: { email: "private@example.com" },
    });
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: "email_account",
        email_account_id: "email-account-1",
        env: "test",
        event_type: "db_access",
        model: "User",
        op_class: "read",
        operation: "findMany",
        request_id: "request-1",
        result_count: 1,
        source: "user/rules",
        status: "success",
        user_id: "user-1",
      }),
    );
  });

  it("skips audit work when audit logging is not configured", async () => {
    isAuditLoggingEnabledMock.mockReturnValue(false);
    const result = [{ id: "row-1", email: "private@example.com" }];
    const query = vi.fn().mockResolvedValue(result);

    await expect(
      auditPrismaOperation({
        args: { where: { email: "private@example.com" } },
        model: "User",
        operation: "findMany",
        query,
      }),
    ).resolves.toBe(result);

    expect(query).toHaveBeenCalledWith({
      where: { email: "private@example.com" },
    });
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it("records write counts from count-returning operations", async () => {
    const query = vi.fn().mockResolvedValue({ count: 5 });

    await auditPrismaOperation({
      args: { data: { enabled: false } },
      model: "Rule",
      operation: "updateMany",
      query,
    });

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "Rule",
        op_class: "write",
        operation: "updateMany",
        result_count: 5,
        status: "success",
      }),
    );
  });

  it("records error metadata without logging messages or stacks", async () => {
    const error = new Error("private email private@example.com leaked");
    error.stack = "stack with refresh token";
    const query = vi.fn().mockRejectedValue(error);

    await expect(
      auditPrismaOperation({
        args: { where: { email: "private@example.com" } },
        model: "EmailAccount",
        operation: "findUnique",
        query,
      }),
    ).rejects.toThrow("private email private@example.com leaked");

    const event = recordAuditEventMock.mock.calls[0][0];
    expect(event).toMatchObject({
      error_name: "Error",
      model: "EmailAccount",
      result_count: null,
      status: "error",
    });
    expect(JSON.stringify(event)).not.toContain("private@example.com");
    expect(JSON.stringify(event)).not.toContain("refresh token");
  });

  it("never copies Prisma args or row data into audit events", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        body: "private body",
        email: "private@example.com",
        refresh_token: "refresh-token",
      },
    ]);

    await auditPrismaOperation({
      args: {
        data: { access_token: "access-token" },
        where: { email: "private@example.com" },
      },
      model: "EmailAccount",
      operation: "findMany",
      query,
    });

    const event = recordAuditEventMock.mock.calls[0][0];
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("private body");
    expect(serialized).not.toContain("refresh-token");
    expect(serialized).not.toContain("access-token");
    expect(event).not.toHaveProperty("args");
    expect(event).not.toHaveProperty("where");
    expect(event).not.toHaveProperty("data");
  });
});
