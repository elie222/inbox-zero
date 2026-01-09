import { describe, it, expect } from "vitest";
import {
  getActionFields,
  sanitizeActionFields,
  actionInputs,
} from "./action-item";
import { ActionType } from "@/generated/prisma/enums";

describe("actionInputs", () => {
  it("has configuration for all action types", () => {
    const actionTypes = Object.values(ActionType);
    for (const type of actionTypes) {
      expect(actionInputs[type]).toBeDefined();
      expect(actionInputs[type].fields).toBeDefined();
    }
  });

  it("ARCHIVE has no fields", () => {
    expect(actionInputs[ActionType.ARCHIVE].fields).toEqual([]);
  });

  it("LABEL has labelId field", () => {
    const fields = actionInputs[ActionType.LABEL].fields;
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("labelId");
  });

  it("DRAFT_EMAIL has subject, content, to, cc, bcc fields", () => {
    const fieldNames = actionInputs[ActionType.DRAFT_EMAIL].fields.map(
      (f) => f.name,
    );
    expect(fieldNames).toContain("subject");
    expect(fieldNames).toContain("content");
    expect(fieldNames).toContain("to");
    expect(fieldNames).toContain("cc");
    expect(fieldNames).toContain("bcc");
  });

  it("CALL_WEBHOOK has url field", () => {
    const fields = actionInputs[ActionType.CALL_WEBHOOK].fields;
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("url");
  });
});

describe("getActionFields", () => {
  it("returns empty object for undefined input", () => {
    expect(getActionFields(undefined)).toEqual({});
  });

  it("returns only fields with values", () => {
    const action = {
      label: "Test Label",
      subject: null,
      content: "",
      to: "test@example.com",
    } as any;
    const result = getActionFields(action);
    expect(result).toEqual({
      label: "Test Label",
      to: "test@example.com",
    });
    expect(result).not.toHaveProperty("subject");
    expect(result).not.toHaveProperty("content");
  });

  it("returns all populated fields", () => {
    const action = {
      label: "Label",
      subject: "Subject",
      content: "Content",
      to: "to@test.com",
      cc: "cc@test.com",
      bcc: "bcc@test.com",
      url: "https://example.com",
      folderName: "Archive",
      folderId: "folder123",
    } as any;
    const result = getActionFields(action);
    expect(result).toEqual({
      label: "Label",
      subject: "Subject",
      content: "Content",
      to: "to@test.com",
      cc: "cc@test.com",
      bcc: "bcc@test.com",
      url: "https://example.com",
      folderName: "Archive",
      folderId: "folder123",
    });
  });

  it("excludes falsy values except for defined nulls", () => {
    const action = {
      label: "",
      subject: null,
      content: undefined,
      to: "test@example.com",
    } as any;
    const result = getActionFields(action);
    expect(result).toEqual({ to: "test@example.com" });
  });
});

describe("sanitizeActionFields", () => {
  describe("actions with no fields", () => {
    it("returns base fields for ARCHIVE", () => {
      const result = sanitizeActionFields({ type: ActionType.ARCHIVE });
      expect(result.type).toBe(ActionType.ARCHIVE);
      expect(result.label).toBeNull();
      expect(result.subject).toBeNull();
      expect(result.content).toBeNull();
    });

    it("returns base fields for MARK_SPAM", () => {
      const result = sanitizeActionFields({ type: ActionType.MARK_SPAM });
      expect(result.type).toBe(ActionType.MARK_SPAM);
    });

    it("returns base fields for MARK_READ", () => {
      const result = sanitizeActionFields({ type: ActionType.MARK_READ });
      expect(result.type).toBe(ActionType.MARK_READ);
    });

    it("returns base fields for DIGEST", () => {
      const result = sanitizeActionFields({ type: ActionType.DIGEST });
      expect(result.type).toBe(ActionType.DIGEST);
    });

    it("returns base fields for NOTIFY_SENDER", () => {
      const result = sanitizeActionFields({ type: ActionType.NOTIFY_SENDER });
      expect(result.type).toBe(ActionType.NOTIFY_SENDER);
    });
  });

  describe("LABEL action", () => {
    it("preserves label and labelId fields", () => {
      const result = sanitizeActionFields({
        type: ActionType.LABEL,
        label: "Newsletters",
        labelId: "label123",
      });
      expect(result.label).toBe("Newsletters");
      expect(result.labelId).toBe("label123");
    });

    it("nullifies unrelated fields", () => {
      const result = sanitizeActionFields({
        type: ActionType.LABEL,
        label: "Test",
        subject: "Should be null",
        to: "should@be.null",
      });
      expect(result.label).toBe("Test");
      expect(result.subject).toBeNull();
      expect(result.to).toBeNull();
    });
  });

  describe("MOVE_FOLDER action", () => {
    it("preserves folderName and folderId fields", () => {
      const result = sanitizeActionFields({
        type: ActionType.MOVE_FOLDER,
        folderName: "Archive",
        folderId: "folder123",
      });
      expect(result.folderName).toBe("Archive");
      expect(result.folderId).toBe("folder123");
    });
  });

  describe("REPLY action", () => {
    it("preserves content, cc, and bcc fields", () => {
      const result = sanitizeActionFields({
        type: ActionType.REPLY,
        content: "Reply content",
        cc: "cc@test.com",
        bcc: "bcc@test.com",
      });
      expect(result.content).toBe("Reply content");
      expect(result.cc).toBe("cc@test.com");
      expect(result.bcc).toBe("bcc@test.com");
    });

    it("nullifies subject and to fields", () => {
      const result = sanitizeActionFields({
        type: ActionType.REPLY,
        subject: "Should be null",
        to: "should@be.null",
        content: "Content",
      });
      expect(result.subject).toBeNull();
      expect(result.to).toBeNull();
      expect(result.content).toBe("Content");
    });
  });

  describe("SEND_EMAIL action", () => {
    it("preserves subject, content, to, cc, and bcc fields", () => {
      const result = sanitizeActionFields({
        type: ActionType.SEND_EMAIL,
        subject: "Subject",
        content: "Content",
        to: "to@test.com",
        cc: "cc@test.com",
        bcc: "bcc@test.com",
      });
      expect(result.subject).toBe("Subject");
      expect(result.content).toBe("Content");
      expect(result.to).toBe("to@test.com");
      expect(result.cc).toBe("cc@test.com");
      expect(result.bcc).toBe("bcc@test.com");
    });
  });

  describe("FORWARD action", () => {
    it("preserves content, to, cc, and bcc fields", () => {
      const result = sanitizeActionFields({
        type: ActionType.FORWARD,
        content: "Extra content",
        to: "forward@test.com",
        cc: "cc@test.com",
        bcc: "bcc@test.com",
      });
      expect(result.content).toBe("Extra content");
      expect(result.to).toBe("forward@test.com");
      expect(result.cc).toBe("cc@test.com");
      expect(result.bcc).toBe("bcc@test.com");
    });

    it("nullifies subject field", () => {
      const result = sanitizeActionFields({
        type: ActionType.FORWARD,
        subject: "Should be null",
        to: "forward@test.com",
      });
      expect(result.subject).toBeNull();
    });
  });

  describe("DRAFT_EMAIL action", () => {
    it("preserves subject, content, to, cc, and bcc fields", () => {
      const result = sanitizeActionFields({
        type: ActionType.DRAFT_EMAIL,
        subject: "Draft Subject",
        content: "Draft Content",
        to: "draft@test.com",
        cc: "cc@test.com",
        bcc: "bcc@test.com",
      });
      expect(result.subject).toBe("Draft Subject");
      expect(result.content).toBe("Draft Content");
      expect(result.to).toBe("draft@test.com");
      expect(result.cc).toBe("cc@test.com");
      expect(result.bcc).toBe("bcc@test.com");
    });
  });

  describe("CALL_WEBHOOK action", () => {
    it("preserves url field", () => {
      const result = sanitizeActionFields({
        type: ActionType.CALL_WEBHOOK,
        url: "https://example.com/webhook",
      });
      expect(result.url).toBe("https://example.com/webhook");
    });

    it("nullifies unrelated fields", () => {
      const result = sanitizeActionFields({
        type: ActionType.CALL_WEBHOOK,
        url: "https://example.com",
        to: "should@be.null",
        content: "should be null",
      });
      expect(result.url).toBe("https://example.com");
      expect(result.to).toBeNull();
      expect(result.content).toBeNull();
    });
  });

  describe("delayInMinutes", () => {
    it("preserves delayInMinutes when provided", () => {
      const result = sanitizeActionFields({
        type: ActionType.ARCHIVE,
        delayInMinutes: 60,
      });
      expect(result.delayInMinutes).toBe(60);
    });

    it("sets delayInMinutes to null when not provided", () => {
      const result = sanitizeActionFields({ type: ActionType.ARCHIVE });
      expect(result.delayInMinutes).toBeNull();
    });
  });
});
