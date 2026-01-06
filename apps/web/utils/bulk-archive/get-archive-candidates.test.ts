import { describe, it, expect } from "vitest";
import {
  getArchiveCandidates,
  type EmailGroup,
} from "./get-archive-candidates";

function createEmailGroup(
  address: string,
  categoryName: string | null,
): EmailGroup {
  return {
    address,
    category: categoryName
      ? ({ id: "cat-1", name: categoryName, description: null } as any)
      : null,
  };
}

describe("getArchiveCandidates", () => {
  describe("high confidence classification", () => {
    it("should classify marketing category as high confidence", () => {
      const groups = [createEmailGroup("test@example.com", "Marketing")];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("high");
      expect(result[0].reason).toBe("Marketing / Promotional");
    });

    it("should classify promotion category as high confidence", () => {
      const groups = [createEmailGroup("test@example.com", "Promotions")];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("high");
      expect(result[0].reason).toBe("Marketing / Promotional");
    });

    it("should classify newsletter category as high confidence", () => {
      const groups = [createEmailGroup("test@example.com", "Newsletter")];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("high");
      expect(result[0].reason).toBe("Marketing / Promotional");
    });

    it("should classify sale category as high confidence", () => {
      const groups = [createEmailGroup("test@example.com", "Sales")];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("high");
      expect(result[0].reason).toBe("Marketing / Promotional");
    });

    it("should match category names case-insensitively", () => {
      const groups = [
        createEmailGroup("test1@example.com", "MARKETING"),
        createEmailGroup("test2@example.com", "Newsletter"),
        createEmailGroup("test3@example.com", "promotional"),
      ];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("high");
      expect(result[1].confidence).toBe("high");
      expect(result[2].confidence).toBe("high");
    });

    it("should match partial category names containing high confidence keywords", () => {
      const groups = [
        createEmailGroup("test1@example.com", "Email Marketing"),
        createEmailGroup("test2@example.com", "Weekly Newsletter"),
        createEmailGroup("test3@example.com", "Flash Sale Alerts"),
      ];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("high");
      expect(result[1].confidence).toBe("high");
      expect(result[2].confidence).toBe("high");
    });
  });

  describe("medium confidence classification", () => {
    it("should classify notification category as medium confidence", () => {
      const groups = [createEmailGroup("test@example.com", "Notifications")];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("medium");
      expect(result[0].reason).toBe("Automated notification");
    });

    it("should classify alert category as medium confidence", () => {
      const groups = [createEmailGroup("test@example.com", "Alerts")];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("medium");
      expect(result[0].reason).toBe("Automated notification");
    });

    it("should classify receipt category as medium confidence", () => {
      const groups = [createEmailGroup("test@example.com", "Receipts")];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("medium");
      expect(result[0].reason).toBe("Automated notification");
    });

    it("should classify update category as medium confidence", () => {
      const groups = [createEmailGroup("test@example.com", "Updates")];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("medium");
      expect(result[0].reason).toBe("Automated notification");
    });

    it("should match partial category names containing medium confidence keywords", () => {
      const groups = [
        createEmailGroup("test1@example.com", "Account Notifications"),
        createEmailGroup("test2@example.com", "Security Alerts"),
        createEmailGroup("test3@example.com", "Purchase Receipts"),
        createEmailGroup("test4@example.com", "Product Updates"),
      ];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("medium");
      expect(result[1].confidence).toBe("medium");
      expect(result[2].confidence).toBe("medium");
      expect(result[3].confidence).toBe("medium");
    });
  });

  describe("low confidence classification", () => {
    it("should classify uncategorized senders as low confidence", () => {
      const groups = [createEmailGroup("test@example.com", null)];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("low");
      expect(result[0].reason).toBe("Infrequent sender");
    });

    it("should classify unrecognized categories as low confidence", () => {
      const groups = [
        createEmailGroup("test1@example.com", "Personal"),
        createEmailGroup("test2@example.com", "Work"),
        createEmailGroup("test3@example.com", "Finance"),
      ];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("low");
      expect(result[1].confidence).toBe("low");
      expect(result[2].confidence).toBe("low");
    });

    it("should classify empty category name as low confidence", () => {
      const groups = [
        {
          address: "test@example.com",
          category: { id: "cat-1", name: "", description: null } as any,
        },
      ];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("low");
    });
  });

  describe("preserves original data", () => {
    it("should preserve the email address in the result", () => {
      const groups = [createEmailGroup("unique@example.com", "Marketing")];
      const result = getArchiveCandidates(groups);

      expect(result[0].address).toBe("unique@example.com");
    });

    it("should preserve the category in the result", () => {
      const category = {
        id: "cat-123",
        name: "Marketing",
        description: "Marketing emails",
      } as any;
      const groups = [{ address: "test@example.com", category }];
      const result = getArchiveCandidates(groups);

      expect(result[0].category).toBe(category);
    });
  });

  describe("batch processing", () => {
    it("should handle empty array", () => {
      const result = getArchiveCandidates([]);

      expect(result).toEqual([]);
    });

    it("should correctly classify multiple senders with different confidence levels", () => {
      const groups = [
        createEmailGroup("marketing@example.com", "Marketing"),
        createEmailGroup("alerts@example.com", "Alerts"),
        createEmailGroup("personal@example.com", "Personal"),
      ];
      const result = getArchiveCandidates(groups);

      expect(result[0].confidence).toBe("high");
      expect(result[1].confidence).toBe("medium");
      expect(result[2].confidence).toBe("low");
    });

    it("should maintain order of input", () => {
      const groups = [
        createEmailGroup("first@example.com", "Personal"),
        createEmailGroup("second@example.com", "Marketing"),
        createEmailGroup("third@example.com", "Alerts"),
      ];
      const result = getArchiveCandidates(groups);

      expect(result[0].address).toBe("first@example.com");
      expect(result[1].address).toBe("second@example.com");
      expect(result[2].address).toBe("third@example.com");
    });
  });
});
