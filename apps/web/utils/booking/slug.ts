const FALLBACK_BOOKING_SLUG = "booking-link";

export function getBookingLinkSlugSuggestion(name: string | null | undefined) {
  const firstName = getFirstName(name);
  const slug = normalizeBookingSlug(firstName ?? FALLBACK_BOOKING_SLUG);

  if (slug.length >= 3) return slug;
  if (slug) return normalizeBookingSlug(`${slug}-booking`);

  return FALLBACK_BOOKING_SLUG;
}

export function normalizeBookingSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function getFirstName(name: string | null | undefined) {
  const trimmedName = name?.trim();
  if (!trimmedName || trimmedName.includes("@")) return null;

  return trimmedName.split(/\s+/)[0] ?? null;
}
