import { env } from "@/env";

export const BRAND_NAME = env.NEXT_PUBLIC_BRAND_NAME;
export const BRAND_LOGO_URL = env.NEXT_PUBLIC_BRAND_LOGO_URL?.trim();
export const BRAND_ICON_URL =
  env.NEXT_PUBLIC_BRAND_ICON_URL?.trim() || "/icon.png";
export const SUPPORT_EMAIL = env.NEXT_PUBLIC_SUPPORT_EMAIL;

export function getBrandTitle(pageTitle: string) {
  return `${pageTitle} | ${BRAND_NAME}`;
}

export function getPossessiveBrandName() {
  return BRAND_NAME.endsWith("s") ? `${BRAND_NAME}'` : `${BRAND_NAME}'s`;
}

export function toAbsoluteUrl(urlOrPath: string) {
  return new URL(urlOrPath, env.NEXT_PUBLIC_BASE_URL).toString();
}
