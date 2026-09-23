import { describe, expect, it } from "vitest";
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
});
