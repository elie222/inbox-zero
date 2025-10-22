import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("admin/digest-tester/process");

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

  logger.info("Processing emails", {
    emailAccountId,
    emailCount: messageIds.length,
  });

  const startTime = Date.now();

  // 1. Get email account and provider (PRODUCTION)
  const emailAccount = await getEmailAccountWithAi({ emailAccountId });
  if (!emailAccount) throw new Error("Email account not found");

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: "google",
  });

  // 2. Get user's rules (PRODUCTION)
  const rules = await prisma.rule.findMany({
    where: {
      emailAccountId,
      enabled: true,
    },
    include: { actions: true, categoryFilters: true },
  });

  logger.info("Loaded rules", { ruleCount: rules.length });

  // 3. Process each email through PRODUCTION runRules()
  const results = [];

  for (const messageId of messageIds) {
    try {
      logger.info("Processing message", { messageId });

      // Fetch full message
      const message = await emailProvider.getMessage(messageId);

      // Run through PRODUCTION rule matching and execution
      // This will:
      // - Match against rules
      // - Execute digest actions via enqueueDigestItem()
      // - Create DigestItems in database via production flow
      const result = await runRules({
        provider: emailProvider,
        message,
        rules,
        emailAccount,
        isTest: false, // Real execution, not test
        modelType: "chat",
      });

      results.push({
        messageId,
        matched: !!result.rule,
        ruleName: result.rule?.name || null,
        actions: result.actionItems?.map((a) => a.type) || [],
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

  logger.info("Finished processing all emails", {
    processingTimeMs: processingTime,
    matched: results.filter((r) => r.matched).length,
  });

  // 4. Wait a moment for QStash to process
  // In production, QStash processes async. For admin tool, we wait a bit.
  logger.info("Waiting for QStash async processing...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 5. Find created digest items
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
          action: {
            select: {
              executedRule: {
                select: {
                  rule: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  logger.info("Found pending digests", {
    digestCount: recentDigests.length,
    itemCount: recentDigests.reduce((sum, d) => sum + d.items.length, 0),
  });

  // 6. Save test run metadata
  const testRun = await prisma.digestTestRun.create({
    data: {
      emailAccountId,
      testLabel: "inbox-zero-digest-test",
      emailCount: messageIds.length,
      digestIds: recentDigests.map((d) => d.id),
    },
  });

  return NextResponse.json({
    testRunId: testRun.id,
    stats: {
      totalEmails: messageIds.length,
      rulesMatched: results.filter((r) => r.matched).length,
      processingTimeMs: processingTime,
    },
    results,
    pendingDigests: recentDigests.length,
    message: `Processed ${messageIds.length} emails via production flow. ${recentDigests.length} pending digests created. Click "Send Digest" to generate email.`,
  });
});
