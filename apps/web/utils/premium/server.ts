// SELF-HOSTED: Most premium server functions removed - all features unlocked
import type { PremiumTier } from "@prisma/client";

// Always return true for self-hosted - all features accessible
export async function checkHasAccess(_params: {
  userId: string;
  minimumTier: PremiumTier;
}): Promise<boolean> {
  return true; // All features unlocked for self-hosted
}

// Stub functions that may still be referenced - all return success
export async function upgradeToPremiumLemon(_options: any) {
  return { users: [] };
}

export async function extendPremiumLemon(_options: any) {
  return { users: [] };
}

export async function cancelPremiumLemon(_options: any) {
  return { users: [] };
}

export async function updateAccountSeats(_options: any) {
  return true;
}

export async function updateAccountSeatsForPremium(
  _premium: any,
  _totalSeats?: any,
) {
  return true;
}

export function createPremium() {
  return Promise.resolve(null);
}
