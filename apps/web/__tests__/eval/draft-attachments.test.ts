import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { AttachmentSourceType } from "@/generated/prisma/enums";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { selectDraftAttachmentsForRule } from "@/utils/attachments/draft-attachments";

// pnpm test-ai eval/draft-attachments
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/draft-attachments

vi.mock("@/utils/prisma");

vi.mock("@/utils/user/get", () => ({
  getUserPremium: vi.fn().mockResolvedValue({
    tier: "PLUS_MONTHLY",
    lemonSqueezyRenewsAt: null,
    stripeSubscriptionStatus: "active",
  }),
}));

vi.mock("@/utils/drive/provider", () => ({
  createDriveProviderWithRefresh: vi.fn().mockResolvedValue({}),
}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-draft-attachments");
const recentDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

type AttachmentSourceRow = Prisma.AttachmentSourceGetPayload<{
  include: {
    documents: true;
    driveConnection: {
      select: {
        id: true;
        provider: true;
        accessToken: true;
        refreshToken: true;
        expiresAt: true;
        isConnected: true;
        emailAccountId: true;
      };
    };
  };
}>;

describe.runIf(shouldRunEval)("draft attachment selection eval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describeEvalMatrix("draft attachment selection", (model, emailAccount) => {
    test(
      "selects the exact property document from approved PDFs",
      async () => {
        prisma.attachmentSource.findMany.mockResolvedValue(
          getAttachmentSources([
            {
              fileId: "insurance-123",
              name: "123 Maple Court - Insurance Certificate.pdf",
              path: "Portfolio/Active Listings/123 Maple Court/Insurance/123 Maple Court - Insurance Certificate.pdf",
              summary:
                "Current insurance certificate for 123 Maple Court. Coverage dates for 2026 and carrier details for the property.",
            },
            {
              fileId: "budget-123",
              name: "123 Maple Court - HOA Budget.pdf",
              path: "Portfolio/Active Listings/123 Maple Court/HOA/123 Maple Court - HOA Budget.pdf",
              summary:
                "HOA annual budget and reserve schedule for 123 Maple Court.",
            },
            {
              fileId: "insurance-456",
              name: "456 Oak Avenue - Insurance Certificate.pdf",
              path: "Portfolio/Active Listings/456 Oak Avenue/Insurance/456 Oak Avenue - Insurance Certificate.pdf",
              summary:
                "Current insurance certificate for 456 Oak Avenue with policy information.",
            },
          ]),
        );

        const result = await selectDraftAttachmentsForRule({
          emailAccount,
          ruleId: "rule-1",
          emailContent:
            "Please send over the current insurance certificate for 123 Maple Court.",
          logger,
        });

        const selectedFileIds = result.selectedAttachments.map(
          (attachment) => attachment.fileId,
        );
        const pass =
          selectedFileIds.length === 1 &&
          selectedFileIds[0] === "insurance-123";

        evalReporter.record({
          testName: "exact property insurance certificate",
          model: model.label,
          pass,
          expected: "insurance-123",
          actual: selectedFileIds.join(", ") || "none",
        });

        expect(selectedFileIds).toEqual(["insurance-123"]);
      },
      TIMEOUT,
    );

    test(
      "returns no attachment when the email does not ask for documents",
      async () => {
        prisma.attachmentSource.findMany.mockResolvedValue(
          getAttachmentSources([
            {
              fileId: "questionnaire-123",
              name: "123 Maple Court - HOA Questionnaire.pdf",
              path: "Portfolio/Active Listings/123 Maple Court/HOA/123 Maple Court - HOA Questionnaire.pdf",
              summary:
                "HOA questionnaire and contact details for 123 Maple Court.",
            },
            {
              fileId: "budget-456",
              name: "456 Oak Avenue - Operating Budget.pdf",
              path: "Portfolio/Active Listings/456 Oak Avenue/Finance/456 Oak Avenue - Operating Budget.pdf",
              summary:
                "Operating budget and expense summary for 456 Oak Avenue.",
            },
          ]),
        );

        const result = await selectDraftAttachmentsForRule({
          emailAccount,
          ruleId: "rule-1",
          emailContent:
            "Thanks for the update. I just wanted to confirm we received your note and will follow up shortly.",
          logger,
        });

        const selectedFileIds = result.selectedAttachments.map(
          (attachment) => attachment.fileId,
        );
        const pass = selectedFileIds.length === 0;

        evalReporter.record({
          testName: "no document request",
          model: model.label,
          pass,
          expected: "none",
          actual: selectedFileIds.join(", ") || "none",
        });

        expect(selectedFileIds).toEqual([]);
      },
      TIMEOUT,
    );
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

function getAttachmentSources(
  documents: Array<{
    fileId: string;
    name: string;
    path: string;
    summary: string;
  }>,
): AttachmentSourceRow[] {
  return [
    {
      id: "attachment-source-1",
      createdAt: recentDate,
      updatedAt: recentDate,
      name: "Property Documents",
      type: AttachmentSourceType.FOLDER,
      sourceId: "folder-1",
      sourcePath: "Portfolio/Active Listings",
      ruleId: "rule-1",
      driveConnectionId: "drive-connection-1",
      driveConnection: {
        id: "drive-connection-1",
        provider: "google",
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        isConnected: true,
        emailAccountId: "email-account-id",
      },
      documents: documents.map((document, index) =>
        getAttachmentDocument({
          id: `attachment-document-${index + 1}`,
          attachmentSourceId: "attachment-source-1",
          ...document,
        }),
      ),
    },
  ];
}

function getAttachmentDocument({
  id,
  attachmentSourceId,
  fileId,
  name,
  path,
  summary,
}: {
  id: string;
  attachmentSourceId: string;
  fileId: string;
  name: string;
  path: string;
  summary: string;
}): AttachmentSourceRow["documents"][number] {
  return {
    id,
    createdAt: recentDate,
    updatedAt: recentDate,
    attachmentSourceId,
    fileId,
    name,
    mimeType: "application/pdf",
    modifiedAt: recentDate,
    summary,
    content: summary,
    metadata: { path },
    indexedAt: recentDate,
    error: null,
  };
}
