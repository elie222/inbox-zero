import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { listChannelsForUser } from "@/utils/messaging/providers/slack/channels";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware();
});
vi.mock("@/utils/messaging/providers/slack/channels", () => ({
  listChannelsForUser: vi.fn(),
}));
vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: vi.fn(),
}));

import { GET } from "./route";

describe("GET /api/user/messaging-channels/[channelId]/targets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists Slack channels the current user is a member of", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue({
      provider: "SLACK",
      accessToken: "xoxb-token",
      providerUserId: "U123",
    } as any);
    vi.mocked(createSlackClient).mockReturnValue({} as never);
    vi.mocked(listChannelsForUser).mockResolvedValue([
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

    expect(listChannelsForUser).toHaveBeenCalledWith(expect.anything(), "U123");
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

    expect(listChannelsForUser).not.toHaveBeenCalled();
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
