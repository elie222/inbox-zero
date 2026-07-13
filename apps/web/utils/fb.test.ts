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

import {
  sendCompleteRegistrationEvent,
  sendFacebookConversionEvent,
} from "@/utils/fb";

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

describe("sendFacebookConversionEvent", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    envMock.FB_CONVERSION_API_ACCESS_TOKEN = "token";
    envMock.FB_PIXEL_ID = "pixel-id";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a timestamped trial event with Meta attribution", async () => {
    await sendFacebookConversionEvent({
      eventName: "StartTrial",
      eventTime: new Date("2026-07-13T12:00:00.000Z"),
      eventId: "evt_trial:trial_started",
      eventSourceUrl: "https://www.getinboxzero.com/premium",
      userId: "user-id",
      email: "USER@example.com ",
      fbc: "fb.1.click",
      fbp: "fb.1.browser",
      customData: {
        currency: "USD",
        value: 0,
        content_name: "price_pro",
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        event_name: "StartTrial",
        event_time: 1_783_944_000,
        event_id: "evt_trial:trial_started",
        action_source: "website",
        event_source_url: "https://www.getinboxzero.com/premium",
        user_data: expect.objectContaining({
          fbc: "fb.1.click",
          fbp: "fb.1.browser",
        }),
        custom_data: {
          currency: "USD",
          value: 0,
          content_name: "price_pro",
        },
      }),
    );
  });

  it("omits missing browser identifiers instead of sending empty values", async () => {
    await sendFacebookConversionEvent({
      eventName: "Subscribe",
      eventTime: new Date("2026-07-13T12:00:00.000Z"),
      eventId: "evt_paid",
      eventSourceUrl: "https://www.getinboxzero.com/premium",
      userId: "user-id",
      email: "user@example.com",
      customData: { currency: "USD", value: 20 },
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body.data[0].user_data).not.toHaveProperty("fbc");
    expect(body.data[0].user_data).not.toHaveProperty("fbp");
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
