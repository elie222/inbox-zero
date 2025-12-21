import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import {
  parseListUnsubscribeHeader,
  supportsOneClickUnsubscribe,
} from "@/utils/parse/list-unsubscribe";

const unsubscribeSchema = z.object({
  senderEmail: z.string().email(),
});

export type OneClickUnsubscribeResponse = {
  success: boolean;
  method: "one-click" | "mailto" | "fallback";
  fallbackUrl?: string;
  error?: string;
};

export const POST = withEmailProvider(
  "user/unsubscribe-one-click",
  async (request) => {
    const { emailProvider, logger } = request;
    const { emailAccountId, email: userEmail } = request.auth;

    const body = await request.json();
    const { senderEmail } = unsubscribeSchema.parse(body);

    logger.info("One-click unsubscribe request", { senderEmail });

    // Get the most recent email from this sender to fetch the headers
    const recentEmail = await prisma.emailMessage.findFirst({
      where: {
        emailAccountId,
        from: senderEmail,
      },
      orderBy: { date: "desc" },
      select: {
        unsubscribeLink: true,
        listUnsubscribePost: true,
      },
    });

    if (!recentEmail?.unsubscribeLink) {
      logger.info("No unsubscribe link found for sender", { senderEmail });
      return NextResponse.json({
        success: false,
        method: "fallback",
        error: "No unsubscribe link found for this sender",
      } satisfies OneClickUnsubscribeResponse);
    }

    const parsed = parseListUnsubscribeHeader(recentEmail.unsubscribeLink);
    const hasOneClick = supportsOneClickUnsubscribe(
      recentEmail.listUnsubscribePost,
    );

    logger.info("Parsed unsubscribe headers", {
      senderEmail,
      hasHttpUrl: !!parsed.httpUrl,
      hasMailtoUrl: !!parsed.mailtoUrl,
      hasOneClick,
    });

    // Try one-click unsubscribe (RFC 8058)
    if (parsed.httpUrl && hasOneClick) {
      try {
        const response = await fetch(parsed.httpUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "List-Unsubscribe=One-Click",
        });

        if (response.ok) {
          logger.info("One-click unsubscribe successful", { senderEmail });
          return NextResponse.json({
            success: true,
            method: "one-click",
          } satisfies OneClickUnsubscribeResponse);
        }

        logger.warn("One-click unsubscribe failed", {
          senderEmail,
          status: response.status,
          statusText: response.statusText,
        });

        // Fall through to try mailto or return fallback
      } catch (error) {
        logger.error("One-click unsubscribe error", {
          senderEmail,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to try mailto or return fallback
      }
    }

    // Try mailto unsubscribe
    if (parsed.mailtoUrl && parsed.mailtoEmail) {
      try {
        await emailProvider.sendEmailWithHtml({
          to: parsed.mailtoEmail,
          subject: parsed.mailtoSubject || "Unsubscribe",
          messageHtml: `<p>Please unsubscribe ${userEmail} from your mailing list.</p>`,
        });

        logger.info("Mailto unsubscribe email sent", {
          senderEmail,
          to: parsed.mailtoEmail,
        });

        return NextResponse.json({
          success: true,
          method: "mailto",
        } satisfies OneClickUnsubscribeResponse);
      } catch (error) {
        logger.error("Mailto unsubscribe error", {
          senderEmail,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to return fallback
      }
    }

    // Fallback: return the HTTP URL for the client to open
    if (parsed.httpUrl) {
      logger.info("Returning fallback URL", {
        senderEmail,
        url: parsed.httpUrl,
      });
      return NextResponse.json({
        success: false,
        method: "fallback",
        fallbackUrl: parsed.httpUrl,
      } satisfies OneClickUnsubscribeResponse);
    }

    // No valid unsubscribe method available
    // The unsubscribeLink might be a direct link from the email body
    logger.info("Returning unsubscribe link as fallback", { senderEmail });
    return NextResponse.json({
      success: false,
      method: "fallback",
      fallbackUrl: recentEmail.unsubscribeLink,
    } satisfies OneClickUnsubscribeResponse);
  },
);
