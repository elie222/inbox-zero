import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateReferralCode,
  getOrCreateReferralCode,
  validateReferralCode,
  checkUserReferral,
  createReferral,
} from "./referral-code";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/__mocks__/prisma";
import { ReferralStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

vi.mock("@/utils/prisma");

describe("referral-code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateReferralCode", () => {
    it("should generate a 6-character code", async () => {
      const code = await generateReferralCode();

      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-Z0-9]+$/);
    });

    it("should generate different codes on subsequent calls", async () => {
      const code1 = await generateReferralCode();
      const code2 = await generateReferralCode();
      const code3 = await generateReferralCode();

      // While theoretically they could be the same, it's extremely unlikely
      expect(new Set([code1, code2, code3]).size).toBeGreaterThan(1);
    });
  });

  describe("getOrCreateReferralCode", () => {
    it("should return existing referral code if user already has one", async () => {
      const mockUser = {
        id: "user1",
        referralCode: "ABC123",
        email: "test@example.com",
        name: "Test User",
      } as any;

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await getOrCreateReferralCode("user1");

      expect(result).toEqual({ code: "ABC123" });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user1" },
        select: {
          referralCode: true,
          email: true,
          name: true,
        },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("should generate and save new referral code if user doesn't have one", async () => {
      const mockUser = {
        id: "user1",
        referralCode: null,
        email: "test@example.com",
        name: "Test User",
      } as any;

      prisma.user.findUnique.mockResolvedValue(mockUser);

      prisma.user.update.mockResolvedValue({
        ...mockUser,
        referralCode: "XYZ789",
      } as any);

      const result = await getOrCreateReferralCode("user1");

      expect(result.code).toHaveLength(6);
      expect(result.code).toMatch(/^[A-Z0-9]+$/);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user1" },
        data: { referralCode: expect.any(String) },
      });
    });

    it("should retry on unique constraint violation", async () => {
      const mockUser = {
        id: "user1",
        referralCode: null,
        email: "test@example.com",
        name: "Test User",
      } as any;

      prisma.user.findUnique.mockResolvedValue(mockUser);

      // First update fails with unique constraint error
      const uniqueError = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        {
          code: "P2002",
          clientVersion: "test",
        },
      );

      // First call fails, second succeeds
      prisma.user.update
        .mockRejectedValueOnce(uniqueError)
        .mockResolvedValueOnce({
          ...mockUser,
          referralCode: "NEWCODE", // Any valid 6-char code
        } as any);

      const result = await getOrCreateReferralCode("user1");

      // Verify the result has the expected format
      expect(result.code).toHaveLength(6);
      expect(result.code).toMatch(/^[A-Z0-9]+$/);
      expect(prisma.user.update).toHaveBeenCalledTimes(2);
    });

    it("should throw SafeError after max retry attempts", async () => {
      const mockUser = {
        id: "user1",
        referralCode: null,
        email: "test@example.com",
        name: "Test User",
      } as any;

      prisma.user.findUnique.mockResolvedValue(mockUser);

      // All updates fail with unique constraint error
      const uniqueError = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        {
          code: "P2002",
          clientVersion: "test",
        },
      );

      prisma.user.update.mockRejectedValue(uniqueError);

      await expect(getOrCreateReferralCode("user1")).rejects.toThrow(
        new SafeError(
          "Unable to generate unique referral code after multiple attempts",
        ),
      );
      expect(prisma.user.update).toHaveBeenCalledTimes(5); // maxAttempts
    });

    it("should re-throw non-unique constraint errors", async () => {
      const mockUser = {
        id: "user1",
        referralCode: null,
        email: "test@example.com",
        name: "Test User",
      } as any;

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const otherError = new Error("Database connection failed");
      prisma.user.update.mockRejectedValue(otherError);

      await expect(getOrCreateReferralCode("user1")).rejects.toThrow(
        "Database connection failed",
      );
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    it("should throw SafeError if user not found", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(getOrCreateReferralCode("nonexistent")).rejects.toThrow(
        SafeError,
      );
      await expect(getOrCreateReferralCode("nonexistent")).rejects.toThrow(
        "User not found",
      );
    });
  });

  describe("validateReferralCode", () => {
    it("should return valid result for existing referral code", async () => {
      const mockUser = {
        id: "user1",
        name: "Test User",
        email: "test@example.com",
        referralCode: "ABC123",
      } as any;

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await validateReferralCode("abc123");

      expect(result).toEqual({
        valid: true,
        referrer: mockUser,
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { referralCode: "ABC123" },
        select: {
          id: true,
          name: true,
          email: true,
          referralCode: true,
        },
      });
    });

    it("should handle case insensitive codes", async () => {
      const mockUser = {
        id: "user1",
        name: "Test User",
        email: "test@example.com",
        referralCode: "ABC123",
      } as any;

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await validateReferralCode("abc123");

      expect(result.valid).toBe(true);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { referralCode: "ABC123" },
        select: {
          id: true,
          name: true,
          email: true,
          referralCode: true,
        },
      });
    });

    it("should return invalid result for non-existent referral code", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await validateReferralCode("INVALID");

      expect(result).toEqual({
        valid: false,
        error: "Invalid referral code",
      });
    });
  });

  describe("checkUserReferral", () => {
    it("should return referral if user was referred", async () => {
      const mockReferral = {
        id: "referral1",
        referrerUserId: "referrer1",
        referredUserId: "user1",
        referralCodeUsed: "ABC123",
        status: ReferralStatus.PENDING,
        referrerUser: {
          id: "referrer1",
          name: "Referrer User",
          email: "referrer@example.com",
          referralCode: "ABC123",
        },
      } as any;

      prisma.referral.findUnique.mockResolvedValue(mockReferral);

      const result = await checkUserReferral("user1");

      expect(result).toEqual(mockReferral);
      expect(prisma.referral.findUnique).toHaveBeenCalledWith({
        where: { referredUserId: "user1" },
        include: {
          referrerUser: {
            select: {
              id: true,
              name: true,
              email: true,
              referralCode: true,
            },
          },
        },
      });
    });

    it("should return null if user was not referred", async () => {
      prisma.referral.findUnique.mockResolvedValue(null);

      const result = await checkUserReferral("user1");

      expect(result).toBeNull();
    });
  });

  describe("createReferral", () => {
    it("should create referral successfully", async () => {
      const mockReferrer = {
        id: "referrer1",
        name: "Referrer User",
        email: "referrer@example.com",
        referralCode: "ABC123",
      } as any;

      const mockReferral = {
        id: "referral1",
        referrerUserId: "referrer1",
        referredUserId: "user1",
        referralCodeUsed: "ABC123",
        status: ReferralStatus.PENDING,
      } as any;

      // Mock validateReferralCode
      prisma.user.findUnique
        .mockResolvedValueOnce(mockReferrer) // validateReferralCode call
        .mockResolvedValueOnce(null); // checkUserReferral call

      prisma.referral.findUnique.mockResolvedValue(null); // checkUserReferral
      prisma.referral.create.mockResolvedValue(mockReferral);

      const result = await createReferral("user1", "abc123");

      expect(result).toEqual(mockReferral);
      expect(prisma.referral.create).toHaveBeenCalledWith({
        data: {
          referrerUserId: "referrer1",
          referredUserId: "user1",
          referralCodeUsed: "ABC123",
          status: ReferralStatus.PENDING,
        },
      });
    });

    it("should throw error for invalid referral code", async () => {
      prisma.user.findUnique.mockResolvedValue(null); // validateReferralCode

      await expect(createReferral("user1", "INVALID")).rejects.toThrow(
        "Invalid referral code",
      );
    });

    it("should throw error if user was already referred", async () => {
      const mockReferrer = {
        id: "referrer1",
        name: "Referrer User",
        email: "referrer@example.com",
        referralCode: "ABC123",
      } as any;

      const existingReferral = {
        id: "existing1",
        referrerUserId: "referrer1",
        referredUserId: "user1",
      } as any;

      prisma.user.findUnique.mockResolvedValue(mockReferrer); // validateReferralCode
      prisma.referral.findUnique.mockResolvedValue(existingReferral); // checkUserReferral

      await expect(createReferral("user1", "ABC123")).rejects.toThrow(
        "User was already referred",
      );
    });

    it("should throw error if user tries to refer themselves", async () => {
      const mockReferrer = {
        id: "user1", // Same as referred user
        name: "User",
        email: "user@example.com",
        referralCode: "ABC123",
      } as any;

      prisma.user.findUnique.mockResolvedValue(mockReferrer); // validateReferralCode
      prisma.referral.findUnique.mockResolvedValue(null); // checkUserReferral

      await expect(createReferral("user1", "ABC123")).rejects.toThrow(
        "You cannot refer yourself",
      );
    });

    it("should handle case insensitive referral code", async () => {
      const mockReferrer = {
        id: "referrer1",
        name: "Referrer User",
        email: "referrer@example.com",
        referralCode: "ABC123",
      } as any;

      const mockReferral = {
        id: "referral1",
        referrerUserId: "referrer1",
        referredUserId: "user1",
        referralCodeUsed: "ABC123",
        status: ReferralStatus.PENDING,
      } as any;

      prisma.user.findUnique.mockResolvedValue(mockReferrer); // validateReferralCode
      prisma.referral.findUnique.mockResolvedValue(null); // checkUserReferral
      prisma.referral.create.mockResolvedValue(mockReferral);

      await createReferral("user1", "abc123");

      expect(prisma.referral.create).toHaveBeenCalledWith({
        data: {
          referrerUserId: "referrer1",
          referredUserId: "user1",
          referralCodeUsed: "ABC123", // Should be uppercase
          status: ReferralStatus.PENDING,
        },
      });
    });
  });
});
