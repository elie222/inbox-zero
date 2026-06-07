import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    FB_CONVERSION_API_ACCESS_TOKEN: "token",
    FB_PIXEL_ID: "pixel-id",
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

import { sendCompleteRegistrationEvent } from "@/utils/fb";

describe("sendCompleteRegistrationEvent", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    envMock.FB_CONVERSION_API_ACCESS_TOKEN = "token";
    envMock.FB_PIXEL_ID = "pixel-id";
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips tracking when Facebook conversion env is not configured", async () => {
    envMock.FB_CONVERSION_API_ACCESS_TOKEN = "";

    await sendCompleteRegistrationEvent(getEventInput());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when Facebook returns a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 });

    await expect(
      sendCompleteRegistrationEvent(getEventInput()),
    ).rejects.toThrow("Facebook conversion event failed: 400");
  });

  it("sends the provided event id for provider-side dedupe", async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await sendCompleteRegistrationEvent(getEventInput());

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body.data[0].event_id).toBe("event-id");
  });
});

function getEventInput() {
  return {
    userId: "user-id",
    email: "user@example.com",
    eventId: "event-id",
    eventSourceUrl: "https://example.com/setup",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    fbc: "fbc",
    fbp: "fbp",
  };
}
