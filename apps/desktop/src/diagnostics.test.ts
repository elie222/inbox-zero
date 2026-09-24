import type { MailDiagnostics } from "@inboxzero/mail-core/engine";
import type { MailStoreInspection } from "@inboxzero/mail-core/ports/mail-store";
import { describe, expect, it, vi } from "vitest";
import {
  diagnosticsFolderName,
  redactHomeDirectory,
  stripTraceUrlQueries,
  summarizeMailEngine,
} from "./diagnostics";

vi.mock("electron", () => ({}));
vi.mock("@sentry/electron/main", () => ({}));

describe("summarizeMailEngine", () => {
  it("keeps sync and queue state but no mail content", () => {
    const inspection = {
      revision: { databaseEpoch: "epoch-1", sequence: 42 },
      accounts: [
        {
          accountId: "acc-1",
          provider: "google",
          generation: "gen-1",
          assistantCursor: "cursor-1",
          connection: "ready",
        },
      ],
      messages: [
        {
          accountId: "acc-1",
          messageId: "m1",
          conversationId: "c1",
          confirmed: { subject: "Quarterly invoice", from: "a@example.com" },
          effective: { pendingOperationIds: [] },
          deleted: false,
        },
      ],
      operations: [],
      operationTargets: [],
      assistantEntries: [{ accountId: "acc-1", summary: "Invoice reminder" }],
      coverage: [
        {
          accountId: "acc-1",
          scopeId: "INBOX",
          metadata: "complete",
          content: "partial",
          indexedContent: "not_requested",
          lastCompletedSyncAtMs: 1000,
        },
        {
          accountId: "acc-2",
          scopeId: "INBOX",
          metadata: "partial",
          content: "partial",
          indexedContent: "partial",
          lastCompletedSyncAtMs: null,
        },
      ],
      streams: [
        {
          accountId: "acc-1",
          streamId: "s1",
          generation: "gen-1",
          checkpoint: "cp",
        },
      ],
    } as unknown as MailStoreInspection;
    const diagnostics: MailDiagnostics[] = [
      {
        accountId: "acc-1",
        revision: inspection.revision,
        connection: "ready",
        coverage: [],
        pendingOperations: 2,
        uncertainOperations: 1,
        pendingJobs: 3,
        oldestPendingAtMs: 500,
        commands: [
          {
            operationId: "op-1",
            status: "queued",
            kind: "metadata",
            changeKind: "archive",
            change: { labelName: "Receipts" },
            messageIds: ["m1"],
            conversationIds: ["c1"],
          },
          {
            operationId: "op-2",
            status: "queued",
            kind: "metadata",
            changeKind: "archive",
            change: null,
            messageIds: ["m2"],
            conversationIds: ["c2"],
          },
        ],
      },
    ];

    const summary = summarizeMailEngine(inspection, diagnostics);

    expect(summary).toEqual({
      status: "ok",
      revision: { databaseEpoch: "epoch-1", sequence: 42 },
      accounts: [
        {
          accountId: "acc-1",
          provider: "google",
          connection: "ready",
          syncStreams: 1,
          coverage: [
            {
              scopeId: "INBOX",
              metadata: "complete",
              content: "partial",
              indexedContent: "not_requested",
              lastCompletedSyncAtMs: 1000,
            },
          ],
          queue: {
            pendingOperations: 2,
            uncertainOperations: 1,
            pendingJobs: 3,
            oldestPendingAtMs: 500,
            commands: { "metadata:queued": 2 },
          },
        },
      ],
    });
    const serialized = JSON.stringify(summary);
    for (const content of ["Quarterly invoice", "a@example.com", "Receipts"]) {
      expect(serialized).not.toContain(content);
    }
  });
});

describe("stripTraceUrlQueries", () => {
  it("drops query strings and fragments from URLs anywhere in the trace", () => {
    const trace = {
      traceEvents: [
        {
          name: "ResourceSendRequest",
          args: {
            data: {
              url: 'https://www.getinboxzero.com/api/threads?q=from:"boss"#top',
              stack: [{ url: "https://cdn.example.com/app.js?v=1" }],
            },
          },
        },
        { name: "FunctionCall", args: { data: { functionName: "render" } } },
      ],
    };

    expect(JSON.parse(stripTraceUrlQueries(JSON.stringify(trace)))).toEqual({
      traceEvents: [
        {
          name: "ResourceSendRequest",
          args: {
            data: {
              url: "https://www.getinboxzero.com/api/threads",
              stack: [{ url: "https://cdn.example.com/app.js" }],
            },
          },
        },
        { name: "FunctionCall", args: { data: { functionName: "render" } } },
      ],
    });
  });
});

describe("diagnosticsFolderName", () => {
  it("avoids characters that Windows rejects in file names", () => {
    expect(diagnosticsFolderName(new Date("2026-09-24T10:11:12.345Z"))).toBe(
      "Inbox-Zero-Diagnostics-2026-09-24T10-11-12",
    );
  });
});

describe("redactHomeDirectory", () => {
  it("replaces the home directory in plain and JSON-escaped paths", () => {
    const trace = JSON.stringify({
      mac: "file:///Users/jane/Library/app.asar/dist/main.js",
      windows: "C:\\Users\\jane\\AppData\\main.js",
    });
    expect(JSON.parse(redactHomeDirectory(trace, "/Users/jane")).mac).toBe(
      "file://~/Library/app.asar/dist/main.js",
    );
    expect(
      JSON.parse(redactHomeDirectory(trace, "C:\\Users\\jane")).windows,
    ).toBe("~\\AppData\\main.js");
  });
});
