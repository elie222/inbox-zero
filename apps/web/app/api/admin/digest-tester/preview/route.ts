import { NextResponse } from "next/server";
import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { DigestStatus } from "@prisma/client";
import { createEmailProvider } from "@/utils/email/provider";
import { extractNameFromEmail } from "@/utils/email";
import { RuleName } from "@/utils/rule/consts";
import { camelCase } from "lodash";
import { storedDigestContentSchema } from "@/app/api/resend/digest/validation";
import { sleep } from "@/utils/sleep";
import type { ParsedMessage } from "@/utils/types";

export const GET = withError(async (request) => {
  const session = await auth();
  if (!isAdmin({ email: session?.user.email })) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const emailAccountId = searchParams.get("emailAccountId");

  if (!emailAccountId) {
    return NextResponse.json(
      { error: "emailAccountId is required" },
      { status: 400 },
    );
  }

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      email: true,
      account: { select: { provider: true } },
    },
  });

  if (!emailAccount) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 404 },
    );
  }

  // Get PENDING digests (created by production flow)
  const pendingDigests = await prisma.digest.findMany({
    where: {
      emailAccountId,
      status: DigestStatus.PENDING,
    },
    include: {
      items: {
        include: {
          action: {
            include: {
              executedRule: {
                include: {
                  rule: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (pendingDigests.length === 0) {
    return NextResponse.json({
      empty: true,
      message: "No pending digests found. Process emails first.",
    });
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: emailAccount.account.provider,
  });

  // Collect all message IDs
  const messageIds = pendingDigests.flatMap((digest) =>
    digest.items.map((item) => item.messageId),
  );

  // Fetch messages in batches (same as production)
  const messages: ParsedMessage[] = [];
  if (messageIds.length > 0) {
    const batchSize = 100;

    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const batchResults = await emailProvider.getMessagesBatch(batch);
      messages.push(...batchResults);

      if (i + batchSize < messageIds.length) {
        await sleep(2000);
      }
    }
  }

  // Create a message lookup map for O(1) access
  const messageMap = new Map(messages.map((m) => [m.id, m]));

  // Map of rules camelCase -> ruleName
  const ruleNameMap = new Map<string, string>();

  // Transform and group in a single pass (same as production)
  type DigestItem = {
    content: string;
    from: string;
    subject: string;
  };
  const executedRulesByRule: Record<string, DigestItem[]> = {};

  pendingDigests.forEach((digest) => {
    digest.items.forEach((item) => {
      const message = messageMap.get(item.messageId);
      if (!message) {
        return;
      }

      const ruleName =
        item.action?.executedRule?.rule?.name || RuleName.ColdEmail;

      const ruleNameKey = camelCase(ruleName);
      if (!ruleNameMap.has(ruleNameKey)) {
        ruleNameMap.set(ruleNameKey, ruleName);
      }

      if (!executedRulesByRule[ruleNameKey]) {
        executedRulesByRule[ruleNameKey] = [];
      }

      let parsedContent: unknown;
      try {
        parsedContent = JSON.parse(item.content);
      } catch {
        return; // Skip this item
      }

      const contentResult = storedDigestContentSchema.safeParse(parsedContent);

      if (contentResult.success) {
        executedRulesByRule[ruleNameKey].push({
          content: contentResult.data.content,
          from: extractNameFromEmail(message?.headers?.from || ""),
          subject: message?.headers?.subject || "",
        });
      }
    });
  });

  // Return JSON data that matches DigestEmail props structure
  return NextResponse.json({
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
    unsubscribeToken: "test-token",
    date: new Date().toISOString(),
    ruleNames: Object.fromEntries(ruleNameMap),
    emailAccountId,
    ...executedRulesByRule,
  });
});

export const dynamic = "force-dynamic";
