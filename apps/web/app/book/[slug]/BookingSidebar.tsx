"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Calendar as CalendarIcon,
  Check,
  ChevronsUpDown,
  Clock,
  Globe,
  Info,
  MapPin,
  Phone,
  Video,
} from "lucide-react";
import type { GetPublicBookingLinkResponse } from "@/app/api/public/booking-links/[slug]/route";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BRAND_ICON_URL, BRAND_NAME } from "@/utils/branding";
import { getSupportedTimezonesWithOffsets } from "@/utils/timezone";
import { cn } from "@/utils";
import {
  formatLongDateTime,
  type HourFormat,
  type Slot,
} from "./booking-helpers";

const BRAND_HOMEPAGE_URL = "https://www.getinboxzero.com";

type BookingLink = GetPublicBookingLinkResponse;

export function BookingSidebar({
  bookingLink,
  timezone,
  onTimezoneChange,
  slot,
  backButton,
  showDescription,
}: {
  bookingLink: BookingLink;
  timezone: string;
  onTimezoneChange?: (timezone: string) => void;
  slot?: Slot;
  backButton?: React.ReactNode;
  showDescription?: boolean;
}) {
  const hostName = bookingLink.hostName || bookingLink.title;
  const initial = (hostName || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="flex min-h-0 flex-col gap-4 p-4 sm:p-6 md:p-7">
      {backButton}
      <div className="flex size-12 items-center justify-center rounded-full bg-blue-50 text-lg font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
        {initial}
      </div>
      <div>
        <div className="text-sm text-muted-foreground">{hostName}</div>
        <h1 className="mt-0.5 break-words text-2xl font-medium tracking-tight text-foreground">
          {bookingLink.title}
        </h1>
      </div>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <SidebarRow icon={<Clock className="size-3.5" />}>
          {bookingLink.durationMinutes} min
        </SidebarRow>
        {slot ? (
          <SidebarRow icon={<CalendarIcon className="size-3.5" />}>
            <span className="font-medium text-foreground">
              {formatLongDateTime(slot.startTime, timezone)}
            </span>
          </SidebarRow>
        ) : null}
        <SidebarRow icon={<LocationIcon type={bookingLink.locationType} />}>
          {locationLabel(bookingLink)}
        </SidebarRow>
        <SidebarRow icon={<Globe className="size-3.5" />}>
          {onTimezoneChange ? (
            <TimezonePicker value={timezone} onChange={onTimezoneChange} />
          ) : (
            timezone
          )}
        </SidebarRow>
      </div>
      {showDescription && bookingLink.description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {bookingLink.description}
        </p>
      ) : null}
      <a
        href={BRAND_HOMEPAGE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto flex items-center gap-1.5 border-t pt-4 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Powered by
        <Image
          src={BRAND_ICON_URL}
          alt={`${BRAND_NAME} icon`}
          width={14}
          height={14}
          className="rounded-sm"
          unoptimized
        />
        <span>{BRAND_NAME}</span>
      </a>
    </div>
  );
}

export function HourFormatToggle({
  value,
  onChange,
}: {
  value: HourFormat;
  onChange: (next: HourFormat) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-input bg-background p-0.5 text-xs">
      {(["12h", "24h"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded px-2 py-0.5 font-medium transition-colors",
            value === option
              ? "bg-blue-600 text-white"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function TimezonePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (timezone: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const timezones = useMemo(() => getSupportedTimezonesWithOffsets(), []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted"
        >
          <span className="truncate">{value}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(20rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] p-0 sm:w-[320px] sm:max-w-none"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search timezone..." />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {timezones.map(({ zone, offsetLabel }) => (
                <CommandItem
                  key={zone}
                  value={zone}
                  onSelect={(selected) => {
                    onChange(selected);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      zone === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex-1 truncate">{zone}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {offsetLabel}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SidebarRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="mt-0.5 shrink-0 text-muted-foreground/70">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function LocationIcon({ type }: { type: BookingLinkLocationType }) {
  const className = "size-3.5";
  switch (type) {
    case BookingLinkLocationType.GOOGLE_MEET:
    case BookingLinkLocationType.MICROSOFT_TEAMS:
      return <Video className={className} />;
    case BookingLinkLocationType.PHONE:
      return <Phone className={className} />;
    case BookingLinkLocationType.IN_PERSON:
      return <MapPin className={className} />;
    default:
      return <Info className={className} />;
  }
}

function locationLabel(link: BookingLink): string {
  switch (link.locationType) {
    case BookingLinkLocationType.GOOGLE_MEET:
      return "Google Meet";
    case BookingLinkLocationType.MICROSOFT_TEAMS:
      return "Microsoft Teams";
    case BookingLinkLocationType.PHONE:
      return "Phone call";
    case BookingLinkLocationType.IN_PERSON:
      return "In person";
    default:
      return "Custom";
  }
}
