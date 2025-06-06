import { randomBytes } from "crypto";
import prisma from "@/utils/prisma";
import { env } from "@/env";

/**
 * Generate a unique referral code for a user
 * Format: USERNAME + 4 random characters (e.g., JOHN2X4K)
 */
export async function generateReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Extract base name from user's name or email
  const baseName = (user.name || user.email.split("@")[0])
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

  let code = "";
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  // Try to generate a unique code
  while (!isUnique && attempts < maxAttempts) {
    const randomPart = randomBytes(2).toString("hex").toUpperCase();
    code = `${baseName}${randomPart}`;

    // Check if code already exists
    const existingCode = await prisma.referralCode.findUnique({
      where: { code },
    });

    if (!existingCode) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    // Fallback to a completely random code if we can't generate a unique one
    code = randomBytes(4).toString("hex").toUpperCase();
  }

  return code;
}

/**
 * Create or get a referral code for a user
 */
export async function getOrCreateReferralCode(userId: string) {
  // Check if user already has a referral code
  const existingCode = await prisma.referralCode.findUnique({
    where: { userId },
  });

  if (existingCode) {
    return existingCode;
  }

  // Generate a new code
  const code = await generateReferralCode(userId);

  // Create the referral code in the database
  return prisma.referralCode.create({
    data: {
      code,
      userId,
    },
  });
}

/**
 * Validate a referral code
 */
export async function validateReferralCode(code: string) {
  const referralCode = await prisma.referralCode.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!referralCode) {
    return { valid: false, error: "Invalid referral code" };
  }

  if (!referralCode.isActive) {
    return { valid: false, error: "Referral code is no longer active" };
  }

  return {
    valid: true,
    referralCode,
    referrer: referralCode.user,
  };
}

/**
 * Generate a referral link
 */
export function generateReferralLink(code: string, baseUrl?: string): string {
  const base = baseUrl || env.NEXT_PUBLIC_BASE_URL;
  return `${base}/signup?ref=${encodeURIComponent(code)}`;
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
        },
      },
      referralCode: true,
    },
  });

  return referral;
}

/**
 * Create a referral relationship
 */
export async function createReferral(
  referredUserId: string,
  referralCodeString: string
) {
  // Validate the referral code
  const validation = await validateReferralCode(referralCodeString);
  
  if (!validation.valid || !validation.referralCode) {
    throw new Error(validation.error || "Invalid referral code");
  }

  // Check if user was already referred
  const existingReferral = await checkUserReferral(referredUserId);
  if (existingReferral) {
    throw new Error("User was already referred");
  }

  // Check if user is trying to refer themselves
  if (validation.referralCode.userId === referredUserId) {
    throw new Error("You cannot refer yourself");
  }

  // Create the referral
  const referral = await prisma.referral.create({
    data: {
      referrerUserId: validation.referralCode.userId,
      referredUserId,
      referralCodeId: validation.referralCode.id,
      status: "PENDING",
    },
  });

  return referral;
}