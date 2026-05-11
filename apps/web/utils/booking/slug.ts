import { slugify } from "@/utils/string";

const FALLBACK_BOOKING_SLUG = "booking-link";

export function getBookingLinkSlugSuggestion(name: string | null | undefined) {
  const trimmed = name?.trim();
  const firstName =
    trimmed && !trimmed.includes("@")
      ? (trimmed.split(/\s+/)[0] ?? null)
      : null;
  const slug = normalizeBookingSlug(firstName ?? FALLBACK_BOOKING_SLUG);

  if (slug.length >= 3) return slug;
  if (slug) return normalizeBookingSlug(`${slug}-booking`);

  return FALLBACK_BOOKING_SLUG;
}

export function normalizeBookingSlug(value: string) {
  // Public booking slugs must match ^[a-z0-9]+(?:-[a-z0-9]+)*$, so strip
  // diacritics ("Café" -> "cafe") and drop any remaining non-ASCII before
  // running the shared slugify.
  const ascii = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return slugify(ascii)
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
