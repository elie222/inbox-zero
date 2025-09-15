import { randomBytes } from "node:crypto";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { ReferralStatus } from "@prisma/client";

/**
 * Generate a random alphanumeric string of specified length
 */
function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((byte) => chars[byte % chars.length])
    .join("");
}

/**
 * Generate a unique referral code for a user
 * Format: 6 random alphanumeric characters
 */
export async function generateReferralCode(): Promise<string> {
  return generateRandomString(6);
}

/**
 * Get or create a referral code for a user
 */
export async function getOrCreateReferralCode(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      referralCode: true,
      email: true,
      name: true,
    },
  });

  if (!user) throw new SafeError("User not found");

  // If user already has a code, return it
  if (user.referralCode) return { code: user.referralCode };

  // Try to generate and assign a unique code with retry logic
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const code = generateRandomString(6);

    try {
      // Attempt to update the user with the new code atomically
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
      });

      return { code };
    } catch (error) {
      // Check if it's a unique constraint violation
      if (isDuplicateError(error)) {
        attempts++;
        // If we've exhausted attempts, throw error
        if (attempts >= maxAttempts) {
          throw new SafeError(
            "Unable to generate unique referral code after multiple attempts",
          );
        }
        // Otherwise, continue to next iteration to try a new code
        continue;
      }
      // Re-throw any other errors
      throw error;
    }
  }

  throw new SafeError("Unable to generate unique referral code");
}

/**
 * Validate a referral code
 */
export async function validateReferralCode(code: string) {
  const user = await prisma.user.findUnique({
    where: { referralCode: code.toUpperCase() },
    select: {
      id: true,
      name: true,
      email: true,
      referralCode: true,
    },
  });

  if (!user) {
    return { valid: false, error: "Invalid referral code" };
  }

  return {
    valid: true,
    referrer: user,
  };
}

/**
 * Check if a user was referred by someone
 */
export async function checkUserReferral(userId: string) {
  const referral = await prisma.referral.findUnique({
    where: { referredUserId: userId },
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

  return referral;
}

/**
 * Create a referral relationship
 */
export async function createReferral(
  referredUserId: string,
  referralCodeString: string,
) {
  // Validate the referral code
  const validation = await validateReferralCode(referralCodeString);

  if (!validation.valid || !validation.referrer) {
    throw new Error(validation.error || "Invalid referral code");
  }

  // Check if user was already referred
  const existingReferral = await checkUserReferral(referredUserId);
  if (existingReferral) {
    throw new Error("User was already referred");
  }

  // Check if user is trying to refer themselves
  if (validation.referrer.id === referredUserId) {
    throw new Error("You cannot refer yourself");
  }

  // Create the referral
  const referral = await prisma.referral.create({
    data: {
      referrerUserId: validation.referrer.id,
      referredUserId,
      referralCodeUsed: referralCodeString.toUpperCase(),
      status: ReferralStatus.PENDING,
    },
  });

  return referral;
}
