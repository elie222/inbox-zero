import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingProvider } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  sendDocumentAskToSlack,
  sendDocumentFiledToSlack,
} from "@inboxzero/slack";
import {
  sendDocumentAskToTeams,
  sendDocumentFiledToTeams,
} from "@/utils/teams/send";
import { getTeamsAccessToken } from "@/utils/teams/token";
import { sendFilingMessagingNotifications } from "./filing-slack-notifications";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@inboxzero/slack", () => ({
  sendDocumentAskToSlack: vi.fn(),
  sendDocumentFiledToSlack: vi.fn(),
}));
vi.mock("@/utils/teams/send", () => ({
  sendDocumentAskToTeams: vi.fn(),
  sendDocumentFiledToTeams: vi.fn(),
}));
vi.mock("@/utils/teams/token", () => ({
  getTeamsAccessToken: vi.fn(),
}));

const logger = createScopedLogger("filing-messaging-notifications-test");
const mockGetTeamsAccessToken = vi.mocked(getTeamsAccessToken);
const mockSendDocumentAskToSlack = vi.mocked(sendDocumentAskToSlack);
const mockSendDocumentFiledToSlack = vi.mocked(sendDocumentFiledToSlack);
const mockSendDocumentAskToTeams = vi.mocked(sendDocumentAskToTeams);
const mockSendDocumentFiledToTeams = vi.mocked(sendDocumentFiledToTeams);

describe("sendFilingMessagingNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues sending to healthy channels when one Teams token refresh fails", async () => {
    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: "teams-bad",
        provider: MessagingProvider.TEAMS,
        accessToken: null,
        refreshToken: "refresh-bad",
        expiresAt: null,
        channelId: "teams-bad-target",
      },
      {
        id: "slack-good",
        provider: MessagingProvider.SLACK,
        accessToken: "slack-token",
        refreshToken: null,
        expiresAt: null,
        channelId: "slack-target",
      },
      {
        id: "teams-good",
        provider: MessagingProvider.TEAMS,
        accessToken: null,
        refreshToken: "refresh-good",
        expiresAt: null,
        channelId: "teams-good-target",
      },
    ] as never);

    prisma.documentFiling.findUnique.mockResolvedValue({
      id: "filing-1",
      wasAsked: false,
      filename: "contract.pdf",
      folderPath: "/Acme/Contracts",
      reasoning: "Contains contract terms.",
      driveConnection: {
        provider: "GOOGLE_DRIVE",
      },
    } as never);

    mockGetTeamsAccessToken.mockImplementation(async ({ channel }) => {
      if (channel.id === "teams-bad") {
        throw new Error("refresh failed");
      }

      return `${channel.id}-access-token`;
    });

    mockSendDocumentFiledToSlack.mockResolvedValue(undefined);
    mockSendDocumentFiledToTeams.mockResolvedValue(undefined);

    await expect(
      sendFilingMessagingNotifications({
        emailAccountId: "email-account-1",
        filingId: "filing-1",
        logger,
      }),
    ).resolves.toBeUndefined();

    expect(mockSendDocumentFiledToSlack).toHaveBeenCalledTimes(1);
    expect(mockSendDocumentFiledToTeams).toHaveBeenCalledTimes(1);
    expect(mockSendDocumentFiledToTeams).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "teams-good-target",
      }),
    );
    expect(mockSendDocumentAskToSlack).not.toHaveBeenCalled();
    expect(mockSendDocumentAskToTeams).not.toHaveBeenCalled();
  });
});
