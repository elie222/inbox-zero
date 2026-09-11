import { BookingLinkLocationType } from "@/generated/prisma/enums";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";

export function getProviderVideoLocationType(
  provider: string | null | undefined,
) {
  if (isGoogleProvider(provider)) {
    return BookingLinkLocationType.GOOGLE_MEET;
  }
  if (isMicrosoftProvider(provider)) {
    return BookingLinkLocationType.MICROSOFT_TEAMS;
  }
  return null;
}

export function getProviderAlignedLocationType({
  locationType,
  provider,
  fallbackLocationType = locationType,
}: {
  locationType: BookingLinkLocationType;
  provider: string | null | undefined;
  fallbackLocationType?: BookingLinkLocationType;
}) {
  if (!isProviderVideoLocationType(locationType)) {
    return locationType;
  }

  return getProviderVideoLocationType(provider) ?? fallbackLocationType;
}

export function isProviderVideoLocationType(
  locationType: BookingLinkLocationType,
) {
  return (
    locationType === BookingLinkLocationType.GOOGLE_MEET ||
    locationType === BookingLinkLocationType.MICROSOFT_TEAMS
  );
}
