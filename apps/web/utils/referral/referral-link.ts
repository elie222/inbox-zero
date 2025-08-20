import { env } from "node:process";

export function generateReferralLink(code: string): string {
  return `${env.NEXT_PUBLIC_BASE_URL}/?ref=${encodeURIComponent(code)}`;
}
