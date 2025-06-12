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

vi.mock("@/utils/prisma");

describe("referral-code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateReferralCode", () => {
    it("should generate a unique 6-character code", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const code = await generateReferralCode();

      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-Z0-9]+$/);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { referralCode: code },
      });
    });

    it("should retry if code already exists and then succeed", async () => {
      const existingUser = { id: "user1", referralCode: "ABC123" } as any;

      prisma.user.findUnique
        .mockResolvedValueOnce(existingUser) // First attempt - code exists
        .mockResolvedValueOnce(null); // Second attempt - code is unique

      const code = await generateReferralCode();

      expect(code).toHaveLength(6);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    });

    it("should throw SafeError if unable to generate unique code after max attempts", async () => {
      const existingUser = { id: "user1", referralCode: "ABC123" } as any;

      // Mock all attempts to return existing user
      prisma.user.findUnique.mockResolvedValue(existingUser);

      const error = await generateReferralCode().catch((e) => e);

      expect(error).toBeInstanceOf(SafeError);
      expect(error.message).toBe("Unable to generate unique referral code");
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(5); // maxAttempts
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

      prisma.user.findUnique
        .mockResolvedValueOnce(mockUser) // getOrCreateReferralCode call
        .mockResolvedValueOnce(null); // generateReferralCode uniqueness check

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
        status: "PENDING",
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
        status: "PENDING",
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
          status: "PENDING",
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
        status: "PENDING",
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
          status: "PENDING",
        },
      });
    });
  });
});
