import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isWellKnownFolder,
  isFolderGuid,
  isOutlookFolder,
  buildLabelFilter,
  OUTLOOK_WELL_KNOWN_FOLDERS,
} from "./label-filter";

describe("Outlook Label Filter", () => {
  describe("isWellKnownFolder", () => {
    it("returns true for well-known folder names", () => {
      expect(isWellKnownFolder("inbox")).toBe(true);
      expect(isWellKnownFolder("sentitems")).toBe(true);
      expect(isWellKnownFolder("drafts")).toBe(true);
      expect(isWellKnownFolder("archive")).toBe(true);
      expect(isWellKnownFolder("deleteditems")).toBe(true);
      expect(isWellKnownFolder("junkemail")).toBe(true);
    });

    it("returns true for well-known folder names regardless of case", () => {
      expect(isWellKnownFolder("INBOX")).toBe(true);
      expect(isWellKnownFolder("Inbox")).toBe(true);
      expect(isWellKnownFolder("SentItems")).toBe(true);
      expect(isWellKnownFolder("DRAFTS")).toBe(true);
    });

    it("returns false for non-folder names", () => {
      expect(isWellKnownFolder("Awaiting reply")).toBe(false);
      expect(isWellKnownFolder("a9dda73e-f716-46ca-8702-69a36b5e8a55")).toBe(
        false,
      );
      expect(isWellKnownFolder("AAMkAGE1M2IyNGNm")).toBe(false);
      expect(isWellKnownFolder("Label_123")).toBe(false);
    });

    it("handles all defined well-known folders", () => {
      for (const folder of OUTLOOK_WELL_KNOWN_FOLDERS) {
        expect(isWellKnownFolder(folder)).toBe(true);
      }
    });
  });

  describe("isFolderGuid", () => {
    it("returns true for folder GUIDs starting with AAM", () => {
      expect(isFolderGuid("AAMkAGE1M2IyNGNm")).toBe(true);
      expect(isFolderGuid("AAMkAGNkNDY5Y2RhLTc3YjUtNDQ3NC04")).toBe(true);
      expect(isFolderGuid("AAM")).toBe(true);
    });

    it("returns false for non-folder GUIDs", () => {
      expect(isFolderGuid("inbox")).toBe(false);
      expect(isFolderGuid("a9dda73e-f716-46ca-8702-69a36b5e8a55")).toBe(false);
      expect(isFolderGuid("Awaiting reply")).toBe(false);
      expect(isFolderGuid("aam")).toBe(false); // case sensitive
    });
  });

  describe("isOutlookFolder", () => {
    it("returns true for well-known folders", () => {
      expect(isOutlookFolder("inbox")).toBe(true);
      expect(isOutlookFolder("INBOX")).toBe(true);
      expect(isOutlookFolder("sentitems")).toBe(true);
    });

    it("returns true for folder GUIDs", () => {
      expect(isOutlookFolder("AAMkAGE1M2IyNGNm")).toBe(true);
    });

    it("returns false for categories", () => {
      expect(isOutlookFolder("Awaiting reply")).toBe(false);
      expect(isOutlookFolder("a9dda73e-f716-46ca-8702-69a36b5e8a55")).toBe(
        false,
      );
      expect(isOutlookFolder("Needs reply")).toBe(false);
    });
  });

  describe("buildLabelFilter", () => {
    const mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      with: vi.fn().mockReturnThis(),
    } as any;

    const createMockClient = (
      categories: Array<{ id: string; displayName: string }>,
    ) =>
      ({
        getClient: () => ({
          api: () => ({
            get: vi.fn().mockResolvedValue({ value: categories }),
          }),
        }),
      }) as any;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns folder filter for well-known folder names", async () => {
      const client = createMockClient([]);
      const result = await buildLabelFilter(client, "inbox", mockLogger);

      expect(result).toEqual({
        type: "folder",
        filter: "parentFolderId eq 'inbox'",
      });
    });

    it("lowercases well-known folder names", async () => {
      const client = createMockClient([]);
      const result = await buildLabelFilter(client, "INBOX", mockLogger);

      expect(result).toEqual({
        type: "folder",
        filter: "parentFolderId eq 'inbox'",
      });
    });

    it("returns folder filter for folder GUIDs", async () => {
      const client = createMockClient([]);
      const result = await buildLabelFilter(
        client,
        "AAMkAGE1M2IyNGNm",
        mockLogger,
      );

      expect(result).toEqual({
        type: "folder",
        filter: "parentFolderId eq 'AAMkAGE1M2IyNGNm'",
      });
    });

    it("returns category filter when category ID is found", async () => {
      const client = createMockClient([
        {
          id: "a9dda73e-f716-46ca-8702-69a36b5e8a55",
          displayName: "Awaiting reply",
        },
      ]);

      const result = await buildLabelFilter(
        client,
        "a9dda73e-f716-46ca-8702-69a36b5e8a55",
        mockLogger,
      );

      expect(result).toEqual({
        type: "category",
        filter: "categories/any(c:c eq 'Awaiting reply')",
      });
    });

    it("returns category filter using labelId as name when ID not found", async () => {
      const client = createMockClient([]);

      const result = await buildLabelFilter(
        client,
        "Awaiting reply",
        mockLogger,
      );

      expect(result).toEqual({
        type: "category",
        filter: "categories/any(c:c eq 'Awaiting reply')",
      });
    });

    it("escapes single quotes in category names", async () => {
      const client = createMockClient([
        { id: "cat-id", displayName: "John's Tasks" },
      ]);

      const result = await buildLabelFilter(client, "cat-id", mockLogger);

      expect(result).toEqual({
        type: "category",
        filter: "categories/any(c:c eq 'John''s Tasks')",
      });
    });

    it("escapes single quotes when using labelId as name", async () => {
      const client = createMockClient([]);

      const result = await buildLabelFilter(
        client,
        "O'Brien's Category",
        mockLogger,
      );

      expect(result).toEqual({
        type: "category",
        filter: "categories/any(c:c eq 'O''Brien''s Category')",
      });
    });
  });
});
