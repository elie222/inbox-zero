import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { connectWhatsAppAction } from "./messaging-channels";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", email: "test@test.com" } })),
}));

describe("messaging channel actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "test@test.com",
      account: { userId: "u1", provider: "google" },
    } as any);
  });

  it("connects WhatsApp when credentials are valid and no conflicts exist", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue(null);
    prisma.messagingChannel.upsert.mockResolvedValue({
      id: "channel-1",
    } as any);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "phone-1",
        display_phone_number: "+15551230000",
        account: { id: "waba-1" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await connectWhatsAppAction("email-1" as any, {
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      accessToken: "token-1",
      authorizedSender: "+1 (555) 123-0000",
      displayName: "Support",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.messagingChannel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: "WHATSAPP",
          teamId: "waba-1",
          providerUserId: "phone-1",
          authorizedSenderId: "15551230000",
          emailAccountId: "email-1",
          teamName: "Support",
        }),
      }),
    );
  });

  it("rejects connect when number is already connected to another account", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue({
      id: "other-channel",
    } as any);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "phone-1",
        display_phone_number: "+15551230000",
        account: { id: "waba-1" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await connectWhatsAppAction("email-1" as any, {
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      accessToken: "token-1",
      authorizedSender: "15551230000",
    });

    expect(result?.serverError).toBe(
      "This WhatsApp number is already connected to another email account",
    );
    expect(prisma.messagingChannel.upsert).not.toHaveBeenCalled();
  });

  it("rejects connect when a concurrent connect hits unique constraint", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue(null);
    prisma.messagingChannel.upsert.mockRejectedValue({ code: "P2002" });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "phone-1",
        display_phone_number: "+15551230000",
        account: { id: "waba-1" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await connectWhatsAppAction("email-1" as any, {
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      accessToken: "token-1",
      authorizedSender: "15551230000",
    });

    expect(result?.serverError).toBe(
      "This WhatsApp number is already connected to another email account",
    );
  });

  it("rejects connect when authorized sender number is invalid", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue(null);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "phone-1",
        display_phone_number: "+15551230000",
        account: { id: "waba-1" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await connectWhatsAppAction("email-1" as any, {
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      accessToken: "token-1",
      authorizedSender: "abc",
    });

    expect(result?.serverError).toBe(
      "Enter a valid WhatsApp number for the authorized sender",
    );
    expect(prisma.messagingChannel.upsert).not.toHaveBeenCalled();
  });
});
