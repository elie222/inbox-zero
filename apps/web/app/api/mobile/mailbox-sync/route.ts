import { NextResponse } from "next/server";
import { z } from "zod";
import { InvalidMailboxSyncCursorError } from "@/utils/email/mailbox-sync";
import type { EmailProvider } from "@/utils/email/types";
import { withEmailProvider } from "@/utils/middleware";

export const maxDuration = 60;

const bodySchema = z
  .object({
    after: z.coerce.date().optional(),
    cursor: z.string().min(1).max(16_384).optional(),
    limit: z.number().int().min(1).max(100).default(100),
  })
  .superRefine(({ after, cursor }, context) => {
    if (!after && !cursor) {
      context.addIssue({
        code: "custom",
        message: "after is required when cursor is omitted",
        path: ["after"],
      });
    }
  });

export type MailboxSyncResponse = Awaited<ReturnType<typeof getData>>;

// POST keeps long, opaque Microsoft delta links out of request URLs and access
// logs while preserving a stable native-mobile sync contract.
export const POST = withEmailProvider(
  "mobile/mailbox-sync",
  async (request) => {
    const input = bodySchema.parse(await request.json());

    try {
      return NextResponse.json(
        await getData({
          accountId: request.auth.emailAccountId,
          emailProvider: request.emailProvider,
          ...input,
        }),
      );
    } catch (error) {
      if (error instanceof InvalidMailboxSyncCursorError) {
        return NextResponse.json(
          { error: "Invalid mailbox sync cursor" },
          { status: 400 },
        );
      }
      throw error;
    }
  },
);

async function getData({
  accountId,
  emailProvider,
  cursor,
  after,
  limit,
}: {
  accountId: string;
  emailProvider: Pick<EmailProvider, "getMailboxSyncPage">;
  cursor?: string;
  after?: Date;
  limit: number;
}) {
  const page = await emailProvider.getMailboxSyncPage({
    after,
    cursor,
    limit,
  });
  return { accountId, ...page };
}
