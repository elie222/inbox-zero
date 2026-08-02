import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { sendMobilePushNotification } from "./mobile-push";

vi.mock("@/utils/prisma");

const logger = createTestLogger();

describe("sendMobilePushNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("sends a notification to every registered device", async () => {
    mockClaimedTokens([
      { id: "token-1", token: "ExponentPushToken[first]" },
      { id: "token-2", token: "ExponentPushToken[second]" },
    ]);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ status: "ok" }, { status: "ok" }],
        }),
        { status: 200 },
      ),
    );

    await sendNotification();

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(String(request?.body))).toEqual([
      expect.objectContaining({
        to: "ExponentPushToken[first]",
        title: "Verification code",
        expiration: new Date("2026-07-31T12:15:00.000Z").getTime() / 1000,
        data: {
          type: "otp",
          url: "/thread/thread-1?accountId=account-1",
        },
      }),
      expect.objectContaining({
        to: "ExponentPushToken[second]",
      }),
    ]);
  });

  it("deduplicates repeated delivery", async () => {
    mockClaimedTokens([{ id: "token-1", token: "ExponentPushToken[first]" }]);
    prisma.mobilePushDelivery.createManyAndReturn.mockResolvedValue([]);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await sendNotification();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends at most 100 notifications in each Expo request", async () => {
    mockClaimedTokens(
      Array.from({ length: 101 }, (_, index) => ({
        id: `token-${index}`,
        token: `ExponentPushToken[token-${index}]`,
      })),
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) => {
        const notificationCount = JSON.parse(String(init?.body)).length;
        return new Response(
          JSON.stringify({
            data: Array.from({ length: notificationCount }, () => ({
              status: "ok",
            })),
          }),
          { status: 200 },
        );
      });

    await sendNotification();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.map(
        ([, init]) => JSON.parse(String(init?.body)).length,
      ),
    ).toEqual([100, 1]);
  });

  it("removes unregistered tokens and retries only rejected devices", async () => {
    mockClaimedTokens([
      { id: "successful", token: "ExponentPushToken[successful]" },
      { id: "unregistered", token: "ExponentPushToken[unregistered]" },
      { id: "retryable", token: "ExponentPushToken[retryable]" },
    ]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { status: "ok" },
            {
              status: "error",
              details: { error: "DeviceNotRegistered" },
            },
            {
              status: "error",
              details: { error: "MessageRateExceeded" },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await sendNotification();

    expect(prisma.mobilePushToken.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["unregistered"] } },
    });
    expect(prisma.mobilePushDelivery.deleteMany).toHaveBeenCalledWith({
      where: {
        deduplicationKey: "otp:account-1:message-1",
        mobilePushTokenId: { in: ["retryable"] },
      },
    });
  });

  it("keeps claims when Expo may have accepted the request", async () => {
    mockClaimedTokens([{ id: "token-1", token: "ExponentPushToken[first]" }]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", { status: 200 }),
    );

    await sendNotification();

    expect(prisma.mobilePushDelivery.deleteMany).not.toHaveBeenCalled();
  });

  it("releases claims after a retryable Expo request failure", async () => {
    mockClaimedTokens([{ id: "token-1", token: "ExponentPushToken[first]" }]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 503 }),
    );

    await sendNotification();

    expect(prisma.mobilePushDelivery.deleteMany).toHaveBeenCalledWith({
      where: {
        deduplicationKey: "otp:account-1:message-1",
        mobilePushTokenId: { in: ["token-1"] },
      },
    });
  });

  it("claims every device in one atomic write", async () => {
    prisma.mobilePushToken.findMany.mockResolvedValue([
      { id: "token-1", token: "ExponentPushToken[first]" },
      { id: "token-2", token: "ExponentPushToken[second]" },
    ] as never);
    prisma.mobilePushDelivery.createManyAndReturn.mockResolvedValue([]);

    await sendNotification();

    expect(prisma.mobilePushDelivery.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        {
          deduplicationKey: "otp:account-1:message-1",
          mobilePushTokenId: "token-1",
        },
        {
          deduplicationKey: "otp:account-1:message-1",
          mobilePushTokenId: "token-2",
        },
      ],
      select: { mobilePushTokenId: true },
      skipDuplicates: true,
    });
  });

  it("keeps claims when Expo returns fewer tickets than requested", async () => {
    mockClaimedTokens([
      { id: "token-1", token: "ExponentPushToken[first]" },
      { id: "token-2", token: "ExponentPushToken[second]" },
    ]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ status: "ok" }] }), {
        status: 200,
      }),
    );
    const warnSpy = vi.spyOn(logger, "warn");

    await sendNotification();

    expect(prisma.mobilePushDelivery.deleteMany).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "Mobile push response outcome is unknown",
      { expectedTicketCount: 2, receivedTicketCount: 1 },
    );
  });
});

function sendNotification() {
  return sendMobilePushNotification({
    userId: "user-1",
    deduplicationKey: "otp:account-1:message-1",
    notification: {
      title: "Verification code",
      body: "Your verification code is 123456",
      sound: "default",
      channelId: "otp",
      priority: "high",
      expiration: new Date("2026-07-31T12:15:00.000Z").getTime() / 1000,
      data: {
        type: "otp",
        url: "/thread/thread-1?accountId=account-1",
      },
    },
    logger,
  });
}

function mockClaimedTokens(tokens: Array<{ id: string; token: string }>) {
  prisma.mobilePushToken.findMany.mockResolvedValue(tokens as never);
  prisma.mobilePushDelivery.createManyAndReturn.mockResolvedValue(
    tokens.map(({ id }) => ({ mobilePushTokenId: id })) as never,
  );
}
