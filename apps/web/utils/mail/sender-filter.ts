import { z } from "zod";
import { canonicalizeEmailAddress } from "@/utils/email";

export const senderFilterSchema = z.string().refine((value) => {
  if (!value.startsWith("@")) return z.email().safeParse(value).success;
  const domain = value.slice(1);
  const labels = domain.split(".");
  return (
    domain.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
    )
  );
}, "Enter a sender email address or @domain.com");

export function matchesSenderFilter(sender: string, filter: string): boolean {
  const address = canonicalizeEmailAddress(sender);
  const normalizedFilter = filter.trim().toLowerCase();
  return normalizedFilter.startsWith("@")
    ? address.endsWith(normalizedFilter)
    : address === canonicalizeEmailAddress(filter);
}
