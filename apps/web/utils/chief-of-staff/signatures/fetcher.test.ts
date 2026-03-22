import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSignatureForAccount, appendSignatureToBody } from "./fetcher";

const mockPrisma = {
  chiefOfStaffConfig: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

const mockGmail = {
  users: {
    settings: {
      sendAs: {
        get: vi.fn(),
      },
    },
  },
};

const EMAIL_ACCOUNT_ID = "account-123";
const EMAIL_ADDRESS = "user@example.com";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSignatureForAccount", () => {
  it("returns cached signature if fresh (< 24h old)", async () => {
    const cachedSignature = "<p>Cached signature</p>";
    const recentFetch = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago

    mockPrisma.chiefOfStaffConfig.findUnique.mockResolvedValue({
      emailAccountId: EMAIL_ACCOUNT_ID,
      signatureHtml: cachedSignature,
      signatureLastFetched: recentFetch,
    });

    const result = await getSignatureForAccount(
      EMAIL_ACCOUNT_ID,
      EMAIL_ADDRESS,
      mockGmail,
      mockPrisma,
    );

    expect(result).toBe(cachedSignature);
    expect(mockGmail.users.settings.sendAs.get).not.toHaveBeenCalled();
    expect(mockPrisma.chiefOfStaffConfig.update).not.toHaveBeenCalled();
  });

  it("fetches from Gmail API if cache is stale (> 24h old)", async () => {
    const staleSignature = "<p>Stale cached signature</p>";
    const staleFetch = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
    const freshSignature = "<p>Fresh signature from API</p>";

    mockPrisma.chiefOfStaffConfig.findUnique.mockResolvedValue({
      emailAccountId: EMAIL_ACCOUNT_ID,
      signatureHtml: staleSignature,
      signatureLastFetched: staleFetch,
    });

    mockGmail.users.settings.sendAs.get.mockResolvedValue({
      data: { signature: freshSignature },
    });

    mockPrisma.chiefOfStaffConfig.update.mockResolvedValue({});

    const result = await getSignatureForAccount(
      EMAIL_ACCOUNT_ID,
      EMAIL_ADDRESS,
      mockGmail,
      mockPrisma,
    );

    expect(result).toBe(freshSignature);
    expect(mockGmail.users.settings.sendAs.get).toHaveBeenCalledWith({
      userId: "me",
      sendAsEmail: EMAIL_ADDRESS,
    });
    expect(mockPrisma.chiefOfStaffConfig.update).toHaveBeenCalledWith({
      where: { emailAccountId: EMAIL_ACCOUNT_ID },
      data: {
        signatureHtml: freshSignature,
        signatureLastFetched: expect.any(Date),
      },
    });
  });

  it("fetches from Gmail API if no cache exists (config.signatureHtml is null)", async () => {
    const freshSignature = "<p>Fresh signature from API</p>";

    mockPrisma.chiefOfStaffConfig.findUnique.mockResolvedValue({
      emailAccountId: EMAIL_ACCOUNT_ID,
      signatureHtml: null,
      signatureLastFetched: null,
    });

    mockGmail.users.settings.sendAs.get.mockResolvedValue({
      data: { signature: freshSignature },
    });

    mockPrisma.chiefOfStaffConfig.update.mockResolvedValue({});

    const result = await getSignatureForAccount(
      EMAIL_ACCOUNT_ID,
      EMAIL_ADDRESS,
      mockGmail,
      mockPrisma,
    );

    expect(result).toBe(freshSignature);
    expect(mockGmail.users.settings.sendAs.get).toHaveBeenCalledWith({
      userId: "me",
      sendAsEmail: EMAIL_ADDRESS,
    });
    expect(mockPrisma.chiefOfStaffConfig.update).toHaveBeenCalledWith({
      where: { emailAccountId: EMAIL_ACCOUNT_ID },
      data: {
        signatureHtml: freshSignature,
        signatureLastFetched: expect.any(Date),
      },
    });
  });
});

describe("appendSignatureToBody", () => {
  it("appends signature to body with double line break", () => {
    const body = "<p>Hello World</p>";
    const signature = "<p>Best regards</p>";
    const result = appendSignatureToBody(body, signature);
    expect(result).toBe(`${body}<br><br>${signature}`);
  });

  it("returns body unchanged if signature is empty string", () => {
    const body = "<p>Hello World</p>";
    const result = appendSignatureToBody(body, "");
    expect(result).toBe(body);
  });
});
