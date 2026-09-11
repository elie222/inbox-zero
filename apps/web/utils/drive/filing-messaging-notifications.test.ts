import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";
import { sendFilingMessagingNotifications } from "./filing-messaging-notifications";
import {
  resolveSlackRouteDestination,
  sendDocumentFiledToSlack,
  sendDocumentAskToSlack,
} from "@/utils/messaging/providers/slack/send";
import { sendAutomationMessage } from "@/utils/automation-jobs/messaging";

vi.mock("@/utils/prisma");
vi.mock("@/utils/messaging/providers/slack/send", () => ({
  resolveSlackRouteDestination: vi.fn(),
  sendDocumentFiledToSlack: vi.fn(),
  sendDocumentAskToSlack: vi.fn(),
}));
vi.mock("@/utils/automation-jobs/messaging", () => ({
  sendAutomationMessage: vi.fn(),
}));

const logger = createTestLogger();

describe("sendFilingMessagingNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.documentFiling.findUnique.mockResolvedValue({
      id: "filing-1",
      filename: "invoice.pdf",
      folderPath: "Invoices",
      reasoning: null,
      fileId: "file-1",
      wasAsked: false,
      driveConnection: { provider: "google" },
    } as any);
  });

  it("skips Slack channels missing a provider user id", async () => {
    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: "channel-1",
        provider: MessagingProvider.SLACK,
        isConnected: true,
        accessToken: "xoxb-token",
        teamId: "team-1",
        providerUserId: null,
        routes: [
          {
            purpose: MessagingRoutePurpose.DOCUMENT_FILINGS,
            targetType: MessagingRouteTargetType.CHANNEL,
            targetId: "C1",
          },
        ],
      },
    ] as any);

    await sendFilingMessagingNotifications({
      emailAccountId: "email-account-1",
      filingId: "filing-1",
      logger,
    });

    expect(resolveSlackRouteDestination).not.toHaveBeenCalled();
    expect(sendDocumentFiledToSlack).not.toHaveBeenCalled();
    expect(sendDocumentAskToSlack).not.toHaveBeenCalled();
  });

  it("skips Teams channels missing a provider user id", async () => {
    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: "channel-2",
        provider: MessagingProvider.TEAMS,
        isConnected: true,
        accessToken: null,
        teamId: "team-2",
        providerUserId: null,
        routes: [
          {
            purpose: MessagingRoutePurpose.DOCUMENT_FILINGS,
            targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
            targetId: "29:teams-user",
          },
        ],
      },
    ] as any);

    await sendFilingMessagingNotifications({
      emailAccountId: "email-account-1",
      filingId: "filing-1",
      logger,
    });

    expect(sendAutomationMessage).not.toHaveBeenCalled();
  });
});
