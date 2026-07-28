import { normalizeBookingSlug } from "@/utils/booking/slug";

const FALLBACK_CARD_SLUG = "my-card";

// Card slugs live in the same public URL space as booking links, so they
// share the booking normalizer rather than growing a second one.
export function normalizeCardSlug(value: string) {
  return normalizeBookingSlug(value);
}

// A first suggestion from the account's own name: "Chris Dagesse" → "chris".
// The user can change it before saving; the action rejects a taken slug.
export function getCardSlugSuggestion(name: string | null | undefined) {
  const trimmed = name?.trim();
  const parts =
    trimmed && !trimmed.includes("@") ? trimmed.split(/\s+/) : undefined;

  const candidates = [parts?.join(" "), parts?.[0], FALLBACK_CARD_SLUG].filter(
    (candidate): candidate is string => !!candidate,
  );

  for (const candidate of candidates) {
    const slug = normalizeCardSlug(candidate);
    if (slug.length >= 3) return slug;
  }

  return FALLBACK_CARD_SLUG;
}
