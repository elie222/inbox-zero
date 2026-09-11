import { z } from "zod";
import { isValidTimeZone } from "@inboxzero/scheduling";
import { BookingLinkLocationType } from "@/generated/prisma/enums";

export const RESERVED_BOOKING_SLUGS = new Set([
  "api",
  "app",
  "auth",
  "blog",
  "book",
  "calendars",
  "cancel",
  "login",
  "logout",
  "pricing",
  "settings",
  "signup",
  "support",
]);

const slugSchema = z
  .string()
  .trim()
  .min(3, "Slug must be at least 3 characters")
  .max(64, "Slug must be 64 characters or fewer")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Use lowercase letters, numbers, and hyphens",
  })
  .refine((slug) => !RESERVED_BOOKING_SLUGS.has(slug), {
    message: "This slug is reserved",
  });

const timezoneSchema = z.string().refine(isValidTimeZone, {
  message: "Use a valid IANA timezone",
});

const locationTypeSchema = z.nativeEnum(BookingLinkLocationType);

const positiveMinutesSchema = z.coerce.number().int().positive();
const nonNegativeMinutesSchema = z.coerce.number().int().nonnegative();

export const createBookingLinkBody = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  slug: slugSchema,
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  timezone: timezoneSchema,
  durationMinutes: positiveMinutesSchema.max(24 * 60).default(30),
  videoEnabled: z.boolean().default(true),
  destinationCalendarId: z.string().optional().nullable(),
});
export type CreateBookingLinkBody = z.infer<typeof createBookingLinkBody>;

export const updateBookingLinkActionBody = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(120).optional(),
  slug: slugSchema.optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
  durationMinutes: positiveMinutesSchema.max(24 * 60).optional(),
  locationType: locationTypeSchema.optional(),
  locationValue: z.string().trim().max(500).optional().nullable(),
  minimumNoticeMinutes: nonNegativeMinutesSchema.max(365 * 24 * 60).optional(),
  maxDaysAhead: z.coerce.number().int().positive().max(365).optional(),
  destinationCalendarId: z.string().optional().nullable(),
});
export type UpdateBookingLinkActionBody = z.infer<
  typeof updateBookingLinkActionBody
>;

export const deleteBookingLinkBody = z.object({
  id: z.string(),
});
export type DeleteBookingLinkBody = z.infer<typeof deleteBookingLinkBody>;

export const bookingWindowBody = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    startMinutes: z.coerce
      .number()
      .int()
      .min(0)
      .max(24 * 60 - 1),
    endMinutes: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 60),
  })
  .refine((window) => window.endMinutes > window.startMinutes, {
    message: "End time must be after start time",
    path: ["endMinutes"],
  });
export type BookingWindowBody = z.infer<typeof bookingWindowBody>;

const bookingWindowsSchema = z
  .array(bookingWindowBody)
  .min(1)
  .superRefine((windows, ctx) => {
    const byWeekday = new Map<number, BookingWindowBody[]>();
    for (const window of windows) {
      const list = byWeekday.get(window.weekday) ?? [];
      list.push(window);
      byWeekday.set(window.weekday, list);
    }
    for (const dayWindows of byWeekday.values()) {
      const sorted = [...dayWindows].sort(
        (a, b) => a.startMinutes - b.startMinutes,
      );
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].startMinutes < sorted[i - 1].endMinutes) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Availability windows on the same day must not overlap",
          });
          return;
        }
      }
    }
  });

export const updateBookingAvailabilityBody = z.object({
  bookingLinkId: z.string(),
  timezone: timezoneSchema,
  minimumNoticeMinutes: nonNegativeMinutesSchema.max(365 * 24 * 60),
  windows: bookingWindowsSchema,
});
export type UpdateBookingAvailabilityBody = z.infer<
  typeof updateBookingAvailabilityBody
>;

export const updateDefaultAvailabilityBody = z.object({
  timezone: timezoneSchema,
  windows: bookingWindowsSchema,
});
export type UpdateDefaultAvailabilityBody = z.infer<
  typeof updateDefaultAvailabilityBody
>;

export const publicBookingBody = z.object({
  slug: slugSchema,
  startTime: z.string().datetime(),
  timezone: timezoneSchema,
  guestName: z.string().trim().min(1).max(120),
  guestEmail: z.string().trim().email().max(320),
  guestNote: z.string().trim().max(2000).optional(),
  idempotencyToken: z.string().trim().min(1).max(128),
});
export type PublicBookingBody = z.infer<typeof publicBookingBody>;

export const publicCancelBookingBody = z.object({
  token: z.string().trim().min(1),
  reason: z.string().trim().max(1000).optional(),
});
export type PublicCancelBookingBody = z.infer<typeof publicCancelBookingBody>;

export const publicRescheduleBookingBody = z.object({
  token: z.string().trim().min(1),
  startTime: z.string().datetime(),
  timezone: timezoneSchema,
});
export type PublicRescheduleBookingBody = z.infer<
  typeof publicRescheduleBookingBody
>;
