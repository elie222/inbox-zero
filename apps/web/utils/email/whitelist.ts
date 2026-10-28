import { extractEmailAddress } from "@/utils/email";

export function isWhitelistedSender(
  from: string,
  whitelist: string | undefined,
) {
  const address = extractEmailAddress(from).toLowerCase();
  if (!address) return false;

  // Application exemptions are mailbox-specific; domain terms are only for the Gmail filter.
  return (
    whitelist?.split(/\s+OR\s+/i).some((entry) => {
      const whitelistedAddress = extractEmailAddress(entry).toLowerCase();
      return address === whitelistedAddress;
    }) ?? false
  );
}
