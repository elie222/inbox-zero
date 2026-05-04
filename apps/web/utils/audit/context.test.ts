import { describe, expect, it } from "vitest";
import {
  getAuditContext,
  runWithAuditContext,
  setAuditContext,
} from "@/utils/audit/context";

describe("audit context", () => {
  it("starts empty outside an audit context", () => {
    expect(getAuditContext()).toEqual({});
  });

  it("carries anonymous route context", async () => {
    await runWithAuditContext(
      {
        actorType: "anonymous",
        requestId: "request-1",
        source: "health",
      },
      async () => {
        expect(getAuditContext()).toEqual({
          actorType: "anonymous",
          requestId: "request-1",
          source: "health",
        });
      },
    );

    expect(getAuditContext()).toEqual({});
  });

  it("adds authenticated user and email account context without dropping request fields", async () => {
    await runWithAuditContext(
      {
        actorType: "anonymous",
        requestId: "request-2",
        source: "user/rules",
      },
      async () => {
        setAuditContext({ actorType: "user", userId: "user-1" });
        setAuditContext({
          actorType: "email_account",
          emailAccountId: "email-account-1",
        });

        expect(getAuditContext()).toEqual({
          actorType: "email_account",
          emailAccountId: "email-account-1",
          requestId: "request-2",
          source: "user/rules",
          userId: "user-1",
        });
      },
    );
  });

  it("adds API key actor context", async () => {
    await runWithAuditContext(
      {
        actorType: "anonymous",
        requestId: "request-3",
        source: "v1/rules",
      },
      async () => {
        setAuditContext({
          actorType: "api_key",
          apiKeyId: "api-key-1",
          emailAccountId: "email-account-1",
          userId: "user-1",
        });

        expect(getAuditContext()).toMatchObject({
          actorType: "api_key",
          apiKeyId: "api-key-1",
          emailAccountId: "email-account-1",
          userId: "user-1",
        });
      },
    );
  });

  it("supports system sources such as cron handlers", async () => {
    await runWithAuditContext(
      {
        actorType: "system",
        requestId: "request-4",
        source: "cron/automation-jobs",
      },
      async () => {
        expect(getAuditContext()).toEqual({
          actorType: "system",
          requestId: "request-4",
          source: "cron/automation-jobs",
        });
      },
    );
  });
});
