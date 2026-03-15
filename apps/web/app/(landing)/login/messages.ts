import { BRAND_NAME, SUPPORT_EMAIL } from "@/utils/branding";

export function getRequiresReconsentDescription(options?: {
  includeSupportText?: boolean;
}) {
  const description = `Sign in again and approve the requested access. If your Microsoft 365 organization restricts consent, ask your admin to approve ${BRAND_NAME} first.`;

  if (!options?.includeSupportText) return description;

  return `${description} If this keeps happening, contact ${SUPPORT_EMAIL}.`;
}
