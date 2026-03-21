import { describe, expect, it, vi } from "vitest";
import { getEmailAccount } from "@/__tests__/helpers";
import { analyzeDocument } from "@/utils/ai/document-filing/analyze-document";

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";
const TIMEOUT = 30_000;

describe.runIf(isAiTest)("analyzeDocument", () => {
  const emailAccount = {
    ...getEmailAccount(),
    user: {
      aiProvider: "openrouter",
      aiModel: "openai/gpt-4.1-mini",
      aiApiKey: process.env.OPENROUTER_API_KEY ?? null,
    },
    filingPrompt: `
Only use the existing folders provided below.

- If MIME type is image/png and file size is 1000 bytes or greater, use the existing folder "Image Files".
- If MIME type is application/pdf and file size is 1000 bytes or greater, use the existing folder "PDF Files".
- If file size is below 1000 bytes, skip.
- If MIME type or file size is missing or unclear, skip.
- Ignore the filename, email subject, and sender when deciding.
`,
  };

  const email = {
    subject: "General update",
    sender: "sender@example.com",
  };

  const folders = [
    {
      id: "folder-images",
      name: "Image Files",
      path: "Image Files",
      driveProvider: "google",
    },
    {
      id: "folder-pdfs",
      name: "PDF Files",
      path: "PDF Files",
      driveProvider: "google",
    },
  ] as const;

  it(
    "uses MIME type to choose between generic attachments with no text",
    async () => {
      const pngResult = await analyzeDocument({
        emailAccount,
        email,
        attachment: {
          filename: "attachment",
          mimeType: "image/png",
          size: 2048,
          content: "",
        },
        folders: [...folders],
      });

      const pdfResult = await analyzeDocument({
        emailAccount,
        email,
        attachment: {
          filename: "attachment",
          mimeType: "application/pdf",
          size: 2048,
          content: "",
        },
        folders: [...folders],
      });

      expect(pngResult.action).toBe("use_existing");
      expect(pngResult.folderId).toBe("folder-images");
      expect(pdfResult.action).toBe("use_existing");
      expect(pdfResult.folderId).toBe("folder-pdfs");
    },
    TIMEOUT,
  );

  it(
    "uses file size to skip small generic attachments with no text",
    async () => {
      const result = await analyzeDocument({
        emailAccount,
        email,
        attachment: {
          filename: "attachment",
          mimeType: "image/png",
          size: 64,
          content: "",
        },
        folders: [...folders],
      });

      expect(result.action).toBe("skip");
    },
    TIMEOUT,
  );
});
