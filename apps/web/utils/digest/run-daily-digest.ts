import prisma from "@/utils/prisma";
import { DigestStatus } from "@/generated/prisma/enums";
import { sleep } from "@/utils/sleep";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { env } from "@/env";
import { sendDigestV2Email } from "@inboxzero/resend";
import type {
  AutoFiledGroup,
  DigestV2Props,
} from "../../../../packages/resend/emails/digest-v2";
import { emailToContentForAI } from "@/utils/ai/content-sanitizer";
import { createEmailProvider } from "@/utils/email/provider";
import type { ParsedMessage } from "@/utils/types";
import { generateDigestContent } from "@/utils/ai/digest/generate-digest-content";
import { digestAlreadySentToday, buildDigestSendCreate } from "./digest-send";
import { formatTodayHumanET, getTodayET } from "./today-et";
import { isEligibleForClassificationFeedback } from "@/utils/rule/consts";
import type { SystemType } from "@/generated/prisma/enums";

type BucketKey =
  | "urgent"
  | "uncertain"
  | "receipts"
  | "newsletters"
  | "marketing"
  | "notifications";

const BUCKET_BY_RULE: Record<string, BucketKey> = {
  Urgent: "urgent",
  Uncertain: "uncertain",
  Receipts: "receipts",
  Newsletters: "newsletters",
  Marketing: "marketing",
  Notifications: "notifications",
};

const AUTO_FILED_TITLES: Record<
  "receipts" | "newsletters" | "marketing" | "notifications",
  string
> = {
  receipts: "Receipts",
  newsletters: "Newsletters",
  marketing: "Marketing",
  notifications: "Notifications",
};

type SourceItem = {
  messageId: string;
  subject: string;
  from: string;
  body: string;
  itemId: string;
  ruleId: string;
  systemType: string | null;
};

type RunResult = {
  emailAccountId: string;
  sent: boolean;
  reason?: string;
  itemCount?: number;
  resendMessageId?: string | null;
};

export async function runDailyDigest(logger: Logger) {
  const todayET = getTodayET();
  const todayHuman = formatTodayHumanET();

  const accounts = await prisma.emailAccount.findMany({
    where: {
      digests: {
        some: {
          status: { in: [DigestStatus.PENDING, DigestStatus.FAILED] },
        },
      },
    },
    select: {
      id: true,
      userId: true,
      email: true,
      about: true,
      multiRuleSelectionEnabled: true,
      timezone: true,
      calendarBookingLink: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
        },
      },
      account: {
        select: {
          provider: true,
          refresh_token: true,
        },
      },
    },
  });

  const results: RunResult[] = [];

  for (const account of accounts) {
    const scoped = logger.with({
      emailAccountId: account.id,
      todayET: todayET.toISOString(),
    });

    const existing = await digestAlreadySentToday(account.id, todayET);
    if (existing) {
      scoped.info("digest.skip.alreadySent", { existingId: existing.id });
      results.push({
        emailAccountId: account.id,
        sent: false,
        reason: "already-sent-today",
      });
      continue;
    }

    if (!account.account?.refresh_token) {
      scoped.warn("digest.skip.noRefreshToken");
      results.push({
        emailAccountId: account.id,
        sent: false,
        reason: "no-refresh-token",
      });
      continue;
    }

    const pendingDigests = await prisma.digest.findMany({
      where: {
        emailAccountId: account.id,
        status: { in: [DigestStatus.PENDING, DigestStatus.FAILED] },
      },
      select: {
        id: true,
        items: {
          select: {
            id: true,
            messageId: true,
            content: true,
            action: {
              select: {
                executedRule: {
                  select: {
                    rule: {
                      select: { name: true, id: true, systemType: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (pendingDigests.length === 0) {
      scoped.info("digest.skip.nothingPending");
      results.push({
        emailAccountId: account.id,
        sent: false,
        reason: "nothing-pending",
      });
      continue;
    }

    const processedDigestIds = pendingDigests.map((d) => d.id);

    await prisma.digest.updateMany({
      where: { id: { in: processedDigestIds } },
      data: { status: DigestStatus.PROCESSING },
    });

    try {
      const allItems = pendingDigests.flatMap((d) => d.items);
      const messageIds = allItems
        .map((i) => i.messageId)
        .filter((m): m is string => !!m);

      const emailProvider = await createEmailProvider({
        emailAccountId: account.id,
        provider: account.account.provider,
        logger: scoped,
      });

      const messages: ParsedMessage[] = [];
      const batchSize = 100;
      for (let i = 0; i < messageIds.length; i += batchSize) {
        const batch = messageIds.slice(i, i + batchSize);
        const batchResults = await emailProvider.getMessagesBatch(batch);
        messages.push(...batchResults);
        if (i + batchSize < messageIds.length) await sleep(2000);
      }
      const messageMap = new Map(messages.map((m) => [m.id, m]));

      const buckets: Record<BucketKey, SourceItem[]> = {
        urgent: [],
        uncertain: [],
        receipts: [],
        newsletters: [],
        marketing: [],
        notifications: [],
      };

      for (const item of allItems) {
        const ruleName = item.action?.executedRule?.rule?.name;
        const bucket = ruleName ? BUCKET_BY_RULE[ruleName] : undefined;
        if (!bucket) continue;
        const msg = messageMap.get(item.messageId);
        if (!msg) {
          scoped.warn("digest.message.notFound", { messageId: item.messageId });
          continue;
        }
        const rule = item.action?.executedRule?.rule;
        buckets[bucket].push({
          messageId: item.messageId,
          subject: msg.headers.subject ?? "(no subject)",
          from: msg.headers.from ?? "(unknown sender)",
          body: emailToContentForAI(msg) ?? "",
          itemId: item.id,
          ruleId: rule?.id ?? "",
          systemType: rule?.systemType ?? null,
        });
      }

      const content = await generateDigestContent({
        emailAccount: {
          id: account.id,
          userId: account.userId,
          email: account.email,
          about: account.about,
          multiRuleSelectionEnabled: account.multiRuleSelectionEnabled,
          timezone: account.timezone,
          calendarBookingLink: account.calendarBookingLink,
          user: account.user,
          account: { provider: account.account.provider },
        },
        todayDate: todayHuman,
        bucketed: buckets,
      });

      const appBase = env.NEXT_PUBLIC_BASE_URL ?? "https://inbox.tdfurn.com";
      const reviewBase = `${appBase}/uncertain`;

      const buildFeedbackUrl = (src: SourceItem): string | undefined => {
        if (
          !src.ruleId ||
          !isEligibleForClassificationFeedback(
            src.systemType as SystemType | null,
          )
        )
          return;
        const senderMatch = /^(.*?)(?:\s*<([^>]+)>)?$/.exec(src.from);
        const fromEmail = senderMatch?.[2] ?? src.from;
        const params = new URLSearchParams({
          messageId: src.messageId,
          fromEmail,
          ruleId: src.ruleId,
        });
        return `${appBase}/feedback?${params.toString()}`;
      };

      const buildActionItems = (
        bucket: SourceItem[],
        sonnetItems: Array<{ messageId: string; summary: string }>,
      ) =>
        sonnetItems
          .map((s) => {
            const src = bucket.find((b) => b.messageId === s.messageId);
            if (!src) return null;
            const senderMatch = /^(.*?)(?:\s*<([^>]+)>)?$/.exec(src.from);
            return {
              subject: src.subject,
              senderName: senderMatch?.[1]?.trim() || src.from,
              senderEmail: senderMatch?.[2],
              summary: s.summary,
              reviewUrl: `${reviewBase}/${src.itemId}`,
              feedbackUrl: buildFeedbackUrl(src),
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

      const autoFiled: AutoFiledGroup[] = (
        ["receipts", "newsletters", "marketing", "notifications"] as const
      ).map((cat) => {
        const firstItem = buckets[cat][0];
        return {
          category: cat,
          title: AUTO_FILED_TITLES[cat],
          emailCount: buckets[cat].length,
          clusterCount: content.autoFiled[cat].length,
          rows: content.autoFiled[cat].map((c) => ({
            label: c.label,
            summary: c.summary,
          })),
          feedbackUrl: firstItem ? buildFeedbackUrl(firstItem) : undefined,
        };
      });

      const props: DigestV2Props = {
        baseUrl: env.NEXT_PUBLIC_BASE_URL ?? "https://inbox.tdfurn.com",
        date: todayHuman,
        sentTime: new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(new Date()),
        narrativeGreeting: content.narrativeGreeting,
        narrativeBody: content.narrativeBody,
        urgent: buildActionItems(buckets.urgent, content.urgent),
        uncertain: buildActionItems(buckets.uncertain, content.uncertain),
        autoFiled,
      };

      const subject = `Daily digest · ${todayHuman}`;
      const sendResult = await sendDigestV2Email({
        from: env.RESEND_FROM_EMAIL ?? "noreply@inbox.tdfurn.com",
        to: account.email,
        emailProps: props,
        subject,
      });

      const totalItems = Object.values(buckets).reduce(
        (n, b) => n + b.length,
        0,
      );

      await prisma.$transaction([
        prisma.digest.updateMany({
          where: { id: { in: processedDigestIds } },
          data: { status: DigestStatus.SENT, sentAt: new Date() },
        }),
        prisma.digestItem.updateMany({
          where: { digestId: { in: processedDigestIds } },
          data: { content: "[REDACTED]" },
        }),
        prisma.digestSend.create(
          buildDigestSendCreate({
            emailAccountId: account.id,
            date: todayET,
            sentAt: new Date(),
            resendMessageId: sendResult.id,
            itemCount: totalItems,
            modelUsed: "claude-sonnet-4-6",
            narrativeSnapshot: content.narrativeBody,
            digestIds: processedDigestIds,
          }),
        ),
      ]);

      scoped.info("digest.send.success", {
        itemCount: totalItems,
        resendMessageId: sendResult.id,
      });
      results.push({
        emailAccountId: account.id,
        sent: true,
        itemCount: totalItems,
        resendMessageId: sendResult.id,
      });
    } catch (error) {
      await prisma.digest.updateMany({
        where: { id: { in: processedDigestIds } },
        data: { status: DigestStatus.FAILED },
      });
      scoped.error("digest.send.failure", {
        error: error instanceof Error ? error.message : String(error),
      });
      captureException(error);
      results.push({
        emailAccountId: account.id,
        sent: false,
        reason: "error",
      });
    }
  }

  return { processedAccounts: accounts.length, results };
}
