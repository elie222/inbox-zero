import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { listPrivateChannelsForUser } from "@/utils/messaging/providers/slack/channels";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware();
});
vi.mock("@/utils/messaging/providers/slack/channels", () => ({
  listPrivateChannelsForUser: vi.fn(),
}));
vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: vi.fn(),
}));

import { GET } from "./route";

describe("GET /api/user/messaging-channels/[channelId]/targets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists only private Slack channels shared with the current user", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue({
      provider: "SLACK",
      accessToken: "xoxb-token",
      providerUserId: "U123",
    } as any);
    vi.mocked(createSlackClient).mockReturnValue({} as never);
    vi.mocked(listPrivateChannelsForUser).mockResolvedValue([
      {
        id: "C234",
        name: "finance-alerts",
        isPrivate: true,
      },
    ]);

    const response = await GET(createRequest(), {
      params: Promise.resolve({ channelId: "channel-1" }),
    });
    const body = await response.json();

    expect(listPrivateChannelsForUser).toHaveBeenCalledWith(
      expect.anything(),
      "U123",
    );
    expect(body).toEqual({
      targets: [
        {
          id: "C234",
          name: "finance-alerts",
          isPrivate: true,
        },
      ],
    });
  });

  it("requires reconnecting Slack when the Slack user id is missing", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue({
      provider: "SLACK",
      accessToken: "xoxb-token",
      providerUserId: null,
    } as any);

    const response = await GET(createRequest(), {
      params: Promise.resolve({ channelId: "channel-1" }),
    });
    const body = await response.json();

    expect(listPrivateChannelsForUser).not.toHaveBeenCalled();
    expect(body).toEqual({
      targets: [],
      error: "Please reconnect Slack before configuring notifications.",
    });
  });
});

function createRequest() {
  return new NextRequest(
    "http://localhost:3000/api/user/messaging-channels/channel-1/targets",
  );
}
