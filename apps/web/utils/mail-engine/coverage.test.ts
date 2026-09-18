import { describe, expect, it } from "vitest";
import type { MailClient } from "@inboxzero/mail-core/engine";
import {
  isMetadataCoverageComplete,
  waitForMetadataCoverage,
} from "./coverage";

describe("isMetadataCoverageComplete", () => {
  it("requires at least one complete coverage row", () => {
    expect(isMetadataCoverageComplete([])).toBe(false);
    expect(
      isMetadataCoverageComplete([
        {
          accountId: "acc-1",
          scopeId: "primary",
          metadata: "partial",
          content: "partial",
          indexedContent: "partial",
          lastCompletedSyncAtMs: null,
        },
      ]),
    ).toBe(false);
    expect(
      isMetadataCoverageComplete([
        {
          accountId: "acc-1",
          scopeId: "primary",
          metadata: "complete",
          content: "partial",
          indexedContent: "partial",
          lastCompletedSyncAtMs: 1,
        },
      ]),
    ).toBe(true);
  });
});

describe("waitForMetadataCoverage", () => {
  it("returns true once diagnostics report complete metadata coverage", async () => {
    let coverage: Array<{
      accountId: string;
      scopeId: string;
      metadata: "partial" | "complete";
      content: "partial";
      indexedContent: "partial";
      lastCompletedSyncAtMs: number | null;
    }> = [];
    const client = {
      getDiagnostics: async () => ({ coverage }),
    } as Pick<MailClient, "getDiagnostics"> as MailClient;
    const abort = new AbortController();
    const waiting = waitForMetadataCoverage(client, "acc-1", abort.signal);
    coverage = [
      {
        accountId: "acc-1",
        scopeId: "primary",
        metadata: "complete",
        content: "partial",
        indexedContent: "partial",
        lastCompletedSyncAtMs: 1,
      },
    ];
    await expect(waiting).resolves.toBe(true);
  });

  it("returns false when aborted before coverage completes", async () => {
    const client = {
      getDiagnostics: async () => ({ coverage: [] }),
    } as Pick<MailClient, "getDiagnostics"> as MailClient;
    const abort = new AbortController();
    const waiting = waitForMetadataCoverage(client, "acc-1", abort.signal);
    abort.abort();
    await expect(waiting).resolves.toBe(false);
  });
});
