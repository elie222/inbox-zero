import { beforeEach, describe, expect, it, vi } from "vitest";
import useSWR from "swr";
import {
  useChannelTargets,
  useMessagingChannels,
} from "./useMessagingChannels";

vi.mock("swr", () => ({
  default: vi.fn(),
}));

describe("useMessagingChannels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSWR).mockReturnValue({} as never);
  });

  it("uses the default messaging channels key when no account override is provided", () => {
    useMessagingChannels();

    expect(useSWR).toHaveBeenCalledWith("/api/user/messaging-channels");
  });

  it("uses an account-scoped key when an account override is provided", () => {
    useMessagingChannels("account-123");

    expect(useSWR).toHaveBeenCalledWith([
      "/api/user/messaging-channels",
      "account-123",
    ]);
  });
});

describe("useChannelTargets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSWR).mockReturnValue({} as never);
  });

  it("does not fetch when channelId is missing", () => {
    useChannelTargets(null);

    expect(useSWR).toHaveBeenCalledWith(null);
  });

  it("uses the default targets key when no account override is provided", () => {
    useChannelTargets("channel-123");

    expect(useSWR).toHaveBeenCalledWith(
      "/api/user/messaging-channels/channel-123/targets",
    );
  });

  it("uses an account-scoped targets key when an account override is provided", () => {
    useChannelTargets("channel-123", "account-123");

    expect(useSWR).toHaveBeenCalledWith([
      "/api/user/messaging-channels/channel-123/targets",
      "account-123",
    ]);
  });
});
