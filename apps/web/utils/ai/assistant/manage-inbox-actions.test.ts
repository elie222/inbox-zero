import { describe, expect, it } from "vitest";
import {
  isManageInboxAction,
  requiresSenderEmails,
  requiresThreadIds,
} from "./manage-inbox-actions";

describe("manageInbox action helpers", () => {
  it("identifies valid inbox actions", () => {
    expect(isManageInboxAction("archive_threads")).toBe(true);
    expect(isManageInboxAction("trash_threads")).toBe(true);
    expect(isManageInboxAction("label_threads")).toBe(true);
    expect(isManageInboxAction("unknown_action")).toBe(false);
    expect(isManageInboxAction(undefined)).toBe(false);
  });

  it("flags actions that require thread IDs", () => {
    expect(requiresThreadIds("archive_threads")).toBe(true);
    expect(requiresThreadIds("trash_threads")).toBe(true);
    expect(requiresThreadIds("label_threads")).toBe(true);
    expect(requiresThreadIds("mark_read_threads")).toBe(true);
    expect(requiresThreadIds("bulk_archive_senders")).toBe(false);
  });

  it("flags actions that require sender emails", () => {
    expect(requiresSenderEmails("bulk_archive_senders")).toBe(true);
    expect(requiresSenderEmails("unsubscribe_senders")).toBe(true);
    expect(requiresSenderEmails("archive_threads")).toBe(false);
    expect(requiresSenderEmails("trash_threads")).toBe(false);
  });
});
