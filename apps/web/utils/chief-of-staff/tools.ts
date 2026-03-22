// apps/web/utils/chief-of-staff/tools.ts

import { tool } from "ai";
import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
import type { PrismaClient } from "@/generated/prisma/client";
import { checkCalendarAvailability } from "./calendar/checker";
import { getAvailableDates, getAvailableTimes } from "./acuity/availability";
import { checkVipStatus } from "./vip/detector";
import {
  bookAppointment,
  rescheduleAppointment,
  cancelAppointment,
} from "./acuity/actions";
import {
  getSignatureForAccount,
  appendSignatureToBody,
} from "./signatures/fetcher";
import { withGmailRetry } from "@/utils/gmail/retry";

export interface ToolContext {
  // biome-ignore lint/suspicious/noExplicitAny: Google Calendar API client (calendar_v3.Calendar)
  calendarAuth: any;
  emailAccountId: string;
  emailAddress: string;
  gmail: gmail_v1.Gmail;
  prisma: PrismaClient;
}

export function createChiefOfStaffTools(ctx: ToolContext) {
  const { emailAccountId, emailAddress, gmail, prisma, calendarAuth } = ctx;

  const check_calendar = tool({
    description:
      "Check availability across all 6 Google Calendars (Personal, Smart College, RMS Work, Praxis, Nutrition, Workout) for a proposed time slot. Returns hard blocks (cannot be moved) and soft conflicts (flexible). Applies prefix convention: FYI events are ignored, events prefixed with ~ are soft. Always call this before booking or suggesting a time.",
    inputSchema: z.object({
      startTime: z
        .string()
        .describe(
          "Proposed start time in ISO 8601 format (e.g. 2026-03-21T14:00:00)",
        ),
      endTime: z
        .string()
        .describe(
          "Proposed end time in ISO 8601 format (e.g. 2026-03-21T15:00:00)",
        ),
      isVip: z
        .boolean()
        .describe(
          "Whether the client is a VIP (5+ past bookings). VIPs can override Friday protection.",
        ),
    }),
    execute: async ({ startTime, endTime, isVip }) => {
      return checkCalendarAvailability({
        calendarClient: calendarAuth,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        isVip,
      });
    },
  });

  const check_acuity_availability = tool({
    description:
      "Get open tutoring slots from Acuity Scheduling. First call with a month to get available dates, then call with a specific date to get available time slots.",
    inputSchema: z.object({
      appointmentTypeId: z
        .number()
        .describe("The Acuity appointment type ID for the tutoring service"),
      month: z
        .string()
        .optional()
        .describe(
          "Month to fetch available dates for, in YYYY-MM format (e.g. 2026-03). Provide this OR date, not both.",
        ),
      date: z
        .string()
        .optional()
        .describe(
          "Specific date to fetch available times for, in YYYY-MM-DD format (e.g. 2026-03-21). Provide this OR month, not both.",
        ),
    }),
    execute: async ({ appointmentTypeId, month, date }) => {
      if (date) {
        const times = await getAvailableTimes(appointmentTypeId, date);
        return { date, times };
      }
      if (month) {
        const dates = await getAvailableDates(appointmentTypeId, month);
        return { month, availableDates: dates };
      }
      return {
        error: "Provide either month (YYYY-MM) or date (YYYY-MM-DD).",
      };
    },
  });

  const get_client_history = tool({
    description:
      "Look up a client's booking history and VIP status. Returns whether they have 5+ past appointments (VIP threshold). VIPs receive priority scheduling including Friday slots. Always call this for scheduling-related emails.",
    inputSchema: z.object({
      clientEmail: z
        .string()
        .email()
        .describe("The email address of the client to look up"),
    }),
    execute: async ({ clientEmail }) => {
      return checkVipStatus(clientEmail, prisma);
    },
  });

  const book_appointment = tool({
    description:
      "Create a new appointment in Acuity Scheduling. Use this after confirming availability. Returns the created appointment details.",
    inputSchema: z.object({
      appointmentTypeID: z.number().describe("The Acuity appointment type ID"),
      datetime: z
        .string()
        .describe(
          "Appointment date and time in ISO 8601 format (e.g. 2026-03-21T14:00:00-05:00)",
        ),
      email: z.string().email().describe("Client email address"),
      firstName: z.string().describe("Client first name"),
      lastName: z.string().describe("Client last name"),
      phone: z.string().optional().describe("Client phone number (optional)"),
      notes: z
        .string()
        .optional()
        .describe("Additional notes for the appointment (optional)"),
    }),
    execute: async ({
      appointmentTypeID,
      datetime,
      email,
      firstName,
      lastName,
      phone,
      notes,
    }) => {
      return bookAppointment({
        appointmentTypeID,
        datetime,
        email,
        firstName,
        lastName,
        phone,
        notes,
      });
    },
  });

  const reschedule_appointment = tool({
    description:
      "Move an existing Acuity appointment to a new date/time. Use when a client requests to change their existing appointment.",
    inputSchema: z.object({
      appointmentId: z
        .number()
        .describe("The numeric ID of the existing Acuity appointment"),
      datetime: z
        .string()
        .describe(
          "New appointment date and time in ISO 8601 format (e.g. 2026-03-28T14:00:00-05:00)",
        ),
    }),
    execute: async ({ appointmentId, datetime }) => {
      return rescheduleAppointment(appointmentId, datetime);
    },
  });

  const cancel_appointment = tool({
    description:
      "Cancel an existing Acuity appointment. Use when a client explicitly requests cancellation.",
    inputSchema: z.object({
      appointmentId: z
        .number()
        .describe("The numeric ID of the Acuity appointment to cancel"),
    }),
    execute: async ({ appointmentId }) => {
      return cancelAppointment(appointmentId);
    },
  });

  const create_gmail_draft = tool({
    description:
      "Create a Gmail draft reply with the account's email signature automatically appended. Use this for draft_approve autonomy mode. Returns the draft ID and thread ID.",
    inputSchema: z.object({
      to: z.string().email().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      bodyHtml: z
        .string()
        .describe(
          "Email body as HTML. The account signature will be appended automatically.",
        ),
      threadId: z
        .string()
        .describe("Gmail thread ID to associate this draft with"),
      inReplyToMessageId: z
        .string()
        .optional()
        .describe("The Gmail message ID to reply to (for threading)"),
    }),
    execute: async ({
      to,
      subject,
      bodyHtml,
      threadId,
      inReplyToMessageId,
    }) => {
      // Fetch and append signature
      const signature = await getSignatureForAccount(
        emailAccountId,
        emailAddress,
        gmail,
        prisma,
      );
      const bodyWithSignature = appendSignatureToBody(bodyHtml, signature);

      // Build raw MIME message
      const headers: string[] = [
        `To: ${to}`,
        `Subject: ${subject}`,
        `From: ${emailAddress}`,
        "MIME-Version: 1.0",
        'Content-Type: text/html; charset="UTF-8"',
      ];
      if (inReplyToMessageId) {
        headers.push(`In-Reply-To: ${inReplyToMessageId}`);
        headers.push(`References: ${inReplyToMessageId}`);
      }

      const rawMessage = `${headers.join("\r\n")}\r\n\r\n${bodyWithSignature}`;
      const encodedMessage = Buffer.from(rawMessage)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const result = await withGmailRetry(() =>
        gmail.users.drafts.create({
          userId: "me",
          requestBody: {
            message: {
              threadId,
              raw: encodedMessage,
            },
          },
        }),
      );

      return {
        gmailDraftId: result.data.id ?? "",
        gmailThreadId: result.data.message?.threadId ?? threadId,
        messageId: result.data.message?.id ?? "",
      };
    },
  });

  return {
    check_calendar,
    check_acuity_availability,
    get_client_history,
    book_appointment,
    reschedule_appointment,
    cancel_appointment,
    create_gmail_draft,
  };
}
