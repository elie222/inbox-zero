import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import { withError } from "@/utils/middleware";
import { createEmailProvider } from "@/utils/email/provider";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { DigestStatus } from "@prisma/client";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { aiSummarizeEmailForDigest } from "@/utils/ai/digest/summarize-email-for-digest";
import { RuleName } from "@/utils/rule/consts";
import { emailToContent } from "@/utils/mail";

const logger = createScopedLogger("admin/digest-tester/force");

const schema = z.object({
  emailAccountId: z.string(),
  messageIds: z.array(z.string()),
});

export const POST = withError(async (request) => {
  const session = await auth();
  if (!isAdmin({ email: session?.user.email })) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  const body = schema.parse(await request.json());
  const { emailAccountId, messageIds } = body;

  logger.info("Force-creating digest items (SYNCHRONOUS)", {
    emailAccountId,
    emailCount: messageIds.length,
  });

  const startTime = Date.now();

  // Get email account with AI config
  const emailAccount = await getEmailAccountWithAi({ emailAccountId });
  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  // Get email provider
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: "google",
  });

  // Process each email SYNCHRONOUSLY (bypass QStash)
  const results = [];

  for (const messageId of messageIds) {
    try {
      logger.info("Processing message synchronously", { messageId });

      // Fetch full message
      const message = await emailProvider.getMessage(messageId);

      // Call AI summarization directly (same as /api/ai/digest does)
      const summary = await aiSummarizeEmailForDigest({
        ruleName: RuleName.ColdEmail, // Use generic rule for testing
        emailAccount,
        messageToSummarize: {
          id: message.id,
          from: message.headers.from,
          to: message.headers.to || "",
          subject: message.headers.subject,
          content: emailToContent(message),
        },
      });

      if (!summary?.content) {
        logger.info("Skipping digest item - AI returned null (likely spam)", {
          messageId,
        });
        results.push({
          messageId,
          skipped: true,
          reason: "AI filtered as spam/promotional",
        });
        continue;
      }

      // Create digest item directly in database (same as upsertDigest does)
      const digest = await findOrCreateDigest(emailAccountId);
      const contentString = JSON.stringify(summary);

      await prisma.digestItem.create({
        data: {
          messageId: message.id,
          threadId: message.threadId,
          content: contentString,
          digestId: digest.id,
        },
      });

      logger.info("Created digest item", { messageId });
      results.push({
        messageId,
        created: true,
      });
    } catch (error) {
      logger.error("Error processing message", { messageId, error });
      results.push({
        messageId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const processingTime = Date.now() - startTime;

  // Find created digest items
  const recentDigests = await prisma.digest.findMany({
    where: {
      emailAccountId,
      status: "PENDING",
      createdAt: { gte: new Date(startTime) },
    },
    include: {
      items: {
        select: {
          messageId: true,
          content: true,
        },
      },
    },
  });

  logger.info("Finished creating digest items", {
    processingTimeMs: processingTime,
    created: results.filter((r) => r.created).length,
    skipped: results.filter((r) => r.skipped).length,
  });

  // Save test run metadata
  const testRun = await prisma.digestTestRun.create({
    data: {
      emailAccountId,
      testLabel: "force-digest",
      emailCount: messageIds.length,
      digestIds: recentDigests.map((d) => d.id),
    },
  });

  const createdCount = recentDigests.reduce(
    (sum, d) => sum + d.items.length,
    0,
  );

  return NextResponse.json({
    testRunId: testRun.id,
    stats: {
      totalEmails: messageIds.length,
      created: results.filter((r) => r.created).length,
      skipped: results.filter((r) => r.skipped).length,
      errors: results.filter((r) => r.error).length,
      processingTimeMs: processingTime,
    },
    results,
    pendingDigests: recentDigests.length,
    digestItems: createdCount,
    message: `Created ${createdCount} digest items from ${messageIds.length} emails. ${results.filter((r) => r.skipped).length} filtered as spam. Click "Send Digest" to generate email.`,
  });
});

// Helper function to find or create a PENDING digest
async function findOrCreateDigest(emailAccountId: string) {
  const existingDigest = await prisma.digest.findFirst({
    where: {
      emailAccountId,
      status: DigestStatus.PENDING,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (existingDigest) {
    return existingDigest;
  }

  return await prisma.digest.create({
    data: {
      emailAccountId,
      status: DigestStatus.PENDING,
    },
  });
}
