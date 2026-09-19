import { describe, expect, it } from "vitest";
import {
  inboxUnreadQuery,
  mailboxCountTargets,
  MAX_MAILBOX_COUNT_LABELS,
} from "./label-count-targets";

describe("mailboxCountTargets", () => {
  it("maps inbox, drafts, labels, and non-system folders onto engine predicates", () => {
    expect(
      mailboxCountTargets({
        accountId: "account-1",
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
        query: inboxUnreadQuery(["account-1"]),
      },
      {
        id: "DRAFT",
        name: "Drafts",
        kind: "system",
        query: {
          accountIds: ["account-1"],
          predicate: { kind: "role", role: "draft" },
          order: "newest_first",
          pageSize: 1,
          after: null,
        },
      },
      {
        id: "Label_1",
        name: "Work",
        kind: "label",
        query: {
          accountIds: ["account-1"],
          predicate: {
            kind: "membership",
            membership: "label",
            id: "Label_1",
          },
          order: "newest_first",
          pageSize: 1,
          after: null,
        },
      },
      {
        id: "projects",
        name: "Projects",
        kind: "folder",
        query: {
          accountIds: ["account-1"],
          predicate: {
            kind: "membership",
            membership: "folder",
            id: "projects",
          },
          order: "newest_first",
          pageSize: 1,
          after: null,
        },
      },
      {
        id: "projects-q1",
        name: "Q1",
        kind: "folder",
        query: {
          accountIds: ["account-1"],
          predicate: {
            kind: "membership",
            membership: "folder",
            id: "projects-q1",
          },
          order: "newest_first",
          pageSize: 1,
          after: null,
        },
      },
    ]);
  });

  it("caps user labels so a label-heavy mailbox does not open unbounded queries", () => {
    const labels = Array.from(
      { length: MAX_MAILBOX_COUNT_LABELS + 5 },
      (_, i) => ({
        id: `Label_${i}`,
        name: `Label ${i}`,
      }),
    );
    const targets = mailboxCountTargets({
      accountId: "account-1",
      labels,
      folders: [],
    });
    expect(targets.filter((target) => target.kind === "label")).toHaveLength(
      MAX_MAILBOX_COUNT_LABELS,
    );
  });
});
