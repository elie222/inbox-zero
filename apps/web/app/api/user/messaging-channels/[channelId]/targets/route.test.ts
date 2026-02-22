import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { findFirst, listChannels, createSlackClient } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  listChannels: vi.fn(),
  createSlackClient: vi.fn(),
}));

vi.mock("@/utils/middleware", () => ({
  withEmailAccount: (
    _scope: string,
    handler: (
      request: {
        auth: { emailAccountId: string };
        logger: { error: (...args: unknown[]) => void };
      },
      context: { params: Promise<{ channelId: string }> },
    ) => Promise<Response>,
  ) => handler,
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    messagingChannel: {
      findFirst,
    },
  },
}));

vi.mock("@inboxzero/slack", () => ({
  listChannels: (...args: unknown[]) => listChannels(...args),
  createSlackClient: (...args: unknown[]) => createSlackClient(...args),
}));

import { GET } from "./route";

describe("messaging channel targets route", () => {
  const logger = { error: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty targets for WhatsApp", async () => {
    findFirst.mockResolvedValue({
      provider: "WHATSAPP",
      accessToken: "token",
    });

    const response = await GET(
      { auth: { emailAccountId: "email-1" }, logger } as any,
      { params: Promise.resolve({ channelId: "channel-1" }) } as any,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ targets: [] });
    expect(listChannels).not.toHaveBeenCalled();
  });

  it("returns Slack targets when provider is Slack", async () => {
    findFirst.mockResolvedValue({
      provider: "SLACK",
      accessToken: "slack-token",
    });
    listChannels.mockResolvedValue([
      { id: "C1", name: "alerts", isPrivate: true },
    ]);
    createSlackClient.mockReturnValue({});

    const response = await GET(
      { auth: { emailAccountId: "email-1" }, logger } as any,
      { params: Promise.resolve({ channelId: "channel-1" }) } as any,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      targets: [{ id: "C1", name: "alerts", isPrivate: true }],
    });
  });
});
