import { BRAND_NAME, SUPPORT_EMAIL } from "@/utils/branding";

export function getRequiresReconsentDescription(options?: {
  includeSupportText?: boolean;
}) {
  const description = `Please sign in again and approve every requested permission. If your Microsoft 365 organization requires admin approval, ask your admin to approve ${BRAND_NAME} first.`;

  if (!options?.includeSupportText) return description;

  return `${description} If this error persists please contact support at ${SUPPORT_EMAIL}`;
}
