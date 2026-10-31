import { describe, expect, it } from "vitest";
import { MAX_MAILBOX_COUNT_TARGETS } from "@inboxzero/mail-core/queries";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import { createWasmSqliteDriver } from "./wasm-sqlite";
import {
  mailboxCountTargets,
  MAX_MAILBOX_COUNT_LABELS,
} from "./label-count-targets";

describe("mailboxCountTargets", () => {
  it("maps inbox, drafts, labels, and non-system folders onto engine predicates", () => {
    expect(
      mailboxCountTargets({
        labels: [{ id: "Label_1", name: "Work" }],
        folders: [
          {
            id: "inbox-folder",
            displayName: "Inbox",
            childFolders: [],
            systemType: "INBOX",
          },
          {
            id: "projects",
            displayName: "Projects",
            childFolders: [
              {
                id: "projects-q1",
                displayName: "Q1",
                childFolders: [],
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        id: "INBOX",
        name: "Inbox",
        kind: "system",
        predicate: { kind: "role", role: "inbox" },
      },
      {
        id: "DRAFT",
        name: "Drafts",
        kind: "system",
        predicate: { kind: "role", role: "draft" },
      },
      {
        id: "Label_1",
        name: "Work",
        kind: "label",
        predicate: { kind: "membership", membership: "label", id: "Label_1" },
      },
      {
        id: "projects",
        name: "Projects",
        kind: "folder",
        predicate: { kind: "membership", membership: "folder", id: "projects" },
      },
      {
        id: "projects-q1",
        name: "Q1",
        kind: "folder",
        predicate: {
          kind: "membership",
          membership: "folder",
          id: "projects-q1",
        },
      },
    ]);
  });

  it("caps user labels so a label-heavy mailbox does not count unbounded targets", () => {
    const labels = Array.from(
      { length: MAX_MAILBOX_COUNT_LABELS + 5 },
      (_, i) => ({
        id: `Label_${i}`,
        name: `Label ${i}`,
      }),
    );
    const targets = mailboxCountTargets({ labels, folders: [] });
    expect(targets.filter((target) => target.kind === "label")).toHaveLength(
      MAX_MAILBOX_COUNT_LABELS,
    );
  });

  it("clips targets to the engine cap so the counts request is not rejected", () => {
    const folders = Array.from({ length: 600 }, (_, i) => ({
      id: `folder-${i}`,
      displayName: `Folder ${i}`,
    }));
    expect(mailboxCountTargets({ labels: [], folders })).toHaveLength(
      MAX_MAILBOX_COUNT_TARGETS,
    );
  });

  it("leaves drafts a pending send will deliver out of the Drafts count", async () => {
    const store = await createSqliteMailStore(
      await createWasmSqliteDriver({ persist: false }),
    );
    try {
      await store.ensureAccount({
        accountId: "acc-1",
        provider: "google",
        generation: "g1",
      });
      await store.applySyncPage({
        ownerId: "owner",
        page: {
          session: { accountId: "acc-1", generation: "g1" },
          requestId: "bootstrap",
          from: { streamId: "primary", generation: "g1", checkpoint: null },
          to: { streamId: "primary", generation: "g1", checkpoint: "1" },
          changes: [
            draftPatch("d-scheduled", "c-scheduled"),
            draftPatch("d-kept", "c-kept"),
          ],
          requiredHydration: [],
          roundComplete: true,
        },
      });

      const drafts = mailboxCountTargets({
        labels: [],
        folders: [],
        hiddenDraftMessageIds: ["d-scheduled"],
      }).find((target) => target.id === "DRAFT");
      if (!drafts) throw new Error("Missing Drafts target");
      const view = await store.readMailboxView({
        accountIds: ["acc-1"],
        predicate: drafts.predicate,
        order: "newest_first",
        pageSize: 10,
        after: null,
      });

      expect(view.view.counts.matchingConversations).toBe(1);
    } finally {
      await store.close();
    }
  });
});

function draftPatch(
  messageId: string,
  conversationId: string,
): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId: "acc-1", messageId },
    reference: {
      provider: "google",
      messageId,
      conversationId,
      version: "1",
    },
    fields: {
      subject: conversationId,
      preview: messageId,
      from: "me@example.com",
      to: ["ada@example.com"],
      cc: [],
      receivedAtMs: 1000,
      read: true,
      starred: false,
      folderId: "drafts",
      labelIds: ["DRAFT"],
      categoryIds: [],
      roles: ["draft"],
      hasAttachments: false,
    },
  };
}
