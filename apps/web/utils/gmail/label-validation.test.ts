import { describe, it, expect } from "vitest";
import {
  validateGmailLabelName,
  validateLabelNameBasic,
} from "./label-validation";

describe("validateLabelNameBasic", () => {
  describe("valid labels", () => {
    it("should accept valid label names", () => {
      const validLabels = [
        "Work",
        "Personal",
        "Important Emails",
        "Project Alpha",
        "2024 Taxes",
        "Follow Up",
        "a".repeat(225), // Max length
        // Nested labels with forward slash are valid
        "Inbox Zero/Archived",
        "Work/Projects",
        "Personal/Family",
        // These would be rejected by Gmail-specific validation but are valid at basic level
        "INBOX",
        "TRAVEL",
        "FINANCE",
      ];

      validLabels.forEach((label) => {
        const result = validateLabelNameBasic(label);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe("empty or whitespace", () => {
    it("should reject empty strings", () => {
      const result = validateLabelNameBasic("");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Label name cannot be empty");
    });

    it("should reject whitespace-only strings", () => {
      const result = validateLabelNameBasic("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Label name cannot be empty");
    });

    it("should reject labels with leading spaces", () => {
      const result = validateLabelNameBasic(" Work");
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        "Label name cannot have leading or trailing spaces",
      );
    });

    it("should reject labels with trailing spaces", () => {
      const result = validateLabelNameBasic("Work ");
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        "Label name cannot have leading or trailing spaces",
      );
    });
  });

  describe("length", () => {
    it("should reject labels longer than 225 characters", () => {
      const longLabel = "a".repeat(226);
      const result = validateLabelNameBasic(longLabel);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Label name cannot exceed 225 characters");
    });
  });

  describe("double spaces", () => {
    it("should reject labels with double spaces", () => {
      const result = validateLabelNameBasic("Work  Items");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Label name cannot contain double spaces");
    });
  });

  describe("invalid characters", () => {
    it("should reject labels with backslash", () => {
      const result = validateLabelNameBasic("Work\\Items");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("\\");
    });

    it("should reject labels with asterisk", () => {
      const result = validateLabelNameBasic("Work*Items");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("*");
    });

    it("should reject labels with plus sign", () => {
      const result = validateLabelNameBasic("Work+Items");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("+");
    });

    it("should reject labels with backtick", () => {
      const result = validateLabelNameBasic("Work`Items");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("`");
    });
  });
});

describe("validateGmailLabelName", () => {
  describe("valid labels", () => {
    it("should accept valid label names", () => {
      const validLabels = [
        "Work",
        "Important Emails",
        "Project Alpha",
        "2024 Taxes",
        "Follow Up",
        "CATEGORY_PERSONAL",
      ];

      validLabels.forEach((label) => {
        const result = validateGmailLabelName(label);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe("reserved system labels", () => {
    it("should reject standard system labels (case-insensitive)", () => {
      const reservedLabels = [
        "INBOX",
        "inbox",
        "Inbox",
        "SPAM",
        "spam",
        "TRASH",
        "trash",
        "UNREAD",
        "STARRED",
        "IMPORTANT",
        "SENT",
        "DRAFT",
        "ALL_MAIL",
        "ALLMAIL",
      ];

      reservedLabels.forEach((label) => {
        const result = validateGmailLabelName(label);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("reserved Gmail system label");
      });
    });

    it("should reject standard category names without prefix (case-insensitive)", () => {
      const categoryLabels = [
        "PERSONAL",
        "personal",
        "SOCIAL",
        "Promotions",
        "UPDATES",
        "FORUMS",
      ];

      categoryLabels.forEach((label) => {
        const result = validateGmailLabelName(label);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("reserved Gmail system label");
      });
    });

    it("should reject specific reserved label names", () => {
      const reservedLabels = [
        "TRAVEL",
        "travel",
        "FINANCE",
        "finance",
        "CHAT",
        "chat",
      ];

      reservedLabels.forEach((label) => {
        const result = validateGmailLabelName(label);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("reserved Gmail system label");
      });
    });

    it("should reject other undocumented reserved labels", () => {
      const undocumentedReserved = [
        "VOICEMAIL",
        "voicemail",
        "SCHEDULED",
        "scheduled",
        "MUTED",
        "muted",
      ];

      undocumentedReserved.forEach((label) => {
        const result = validateGmailLabelName(label);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("reserved");
      });
    });

    it("should accept labels that are NOT reserved (common confusion)", () => {
      const allowedLabels = [
        "Notes",
        "NOTES",
        "notes",
        "Opened",
        "OPENED",
        "opened",
        "CATEGORY_TRAVEL",
        "category_travel",
        "CATEGORY_FINANCE",
        "category_finance",
        "CHAT_Something",
        "chat_meeting",
      ];

      allowedLabels.forEach((label) => {
        const result = validateGmailLabelName(label);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe("category prefix handling", () => {
    it("should allow standard CATEGORY_ labels", () => {
      const standardCategories = [
        "CATEGORY_PERSONAL",
        "CATEGORY_SOCIAL",
        "CATEGORY_PROMOTIONS",
        "CATEGORY_UPDATES",
        "CATEGORY_FORUMS",
        "category_personal",
      ];

      standardCategories.forEach((label) => {
        const result = validateGmailLabelName(label);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it("should allow custom CATEGORY_ labels", () => {
      const customCategories = [
        "CATEGORY_Custom",
        "CATEGORY_TRAVEL",
        "CATEGORY_FINANCE",
        "category_custom",
      ];

      customCategories.forEach((label) => {
        const result = validateGmailLabelName(label);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });
  });
});
