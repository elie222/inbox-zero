import { env } from "@/env";

// The link the user hands out. Built from the configured base URL so the
// value copied in the app matches what the email says.
export function getContactCardUrl(slug: string) {
  return `${env.NEXT_PUBLIC_BASE_URL}/card/${slug}`;
}
