import { afterAll, describe, expect, test } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { analyzeDocument } from "@/utils/ai/document-filing/analyze-document";

// pnpm test-ai eval/analyze-document
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/analyze-document

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 30_000;

const filingPrompt = `
Only use the existing folders provided below.

- If MIME type is image/png and file size is 1000 bytes or greater, use the existing folder "Image Files".
- If MIME type is application/pdf and file size is 1000 bytes or greater, use the existing folder "PDF Files".
- If file size is below 1000 bytes, skip.
- If MIME type or file size is missing or unclear, skip.
- Ignore the filename, email subject, and sender when deciding.
`;

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

const testCases = [
  {
    name: "routes a generic png by MIME type",
    attachment: {
      filename: "attachment",
      mimeType: "image/png",
      size: 2048,
      content: "",
    },
    expectedAction: "use_existing",
    expectedFolderId: "folder-images",
  },
  {
    name: "routes a generic pdf by MIME type",
    attachment: {
      filename: "attachment",
      mimeType: "application/pdf",
      size: 2048,
      content: "",
    },
    expectedAction: "use_existing",
    expectedFolderId: "folder-pdfs",
  },
  {
    name: "skips a small generic attachment by size",
    attachment: {
      filename: "attachment",
      mimeType: "image/png",
      size: 64,
      content: "",
    },
    expectedAction: "skip",
    expectedFolderId: null,
  },
] as const;

describe.runIf(shouldRunEval)("Eval: Analyze Document", () => {
  const evalReporter = createEvalReporter();

  describeEvalMatrix("analyze-document", (model, emailAccount) => {
    for (const testCase of testCases) {
      test(
        testCase.name,
        async () => {
          const result = await analyzeDocument({
            emailAccount: {
              ...emailAccount,
              filingPrompt,
            },
            email,
            attachment: testCase.attachment,
            folders: [...folders],
          });

          const pass =
            result.action === testCase.expectedAction &&
            (testCase.expectedFolderId == null ||
              result.folderId === testCase.expectedFolderId);

          evalReporter.record({
            testName: testCase.name,
            model: model.label,
            pass,
            expected:
              testCase.expectedFolderId == null
                ? testCase.expectedAction
                : `${testCase.expectedAction}:${testCase.expectedFolderId}`,
            actual:
              result.folderId == null
                ? result.action
                : `${result.action}:${result.folderId}`,
          });

          expect(result.action).toBe(testCase.expectedAction);
          expect(result.folderId ?? null).toBe(testCase.expectedFolderId);
        },
        TIMEOUT,
      );
    }
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});
