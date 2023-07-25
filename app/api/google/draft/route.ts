import { z } from "zod";
import { gmail_v1 } from "googleapis";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getAuthSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/google";

const draftEmailBody = z.object({
  subject: z.string(),
  body: z.string(),
  to: z.string(),
  threadId: z.string(),
});
export type DraftEmailBody = z.infer<typeof draftEmailBody>;
export type DraftEmailResponse = Awaited<ReturnType<typeof draftEmail>>;

export async function draftEmail(body: DraftEmailBody, gmail: gmail_v1.Gmail) {
  const message = [
    'Content-Type: text/plain; charset="UTF-8"\n',
    "MIME-Version: 1.0\n",
    "Content-Transfer-Encoding: 7bit\n",
    `to: ${body.to}\n`,
    `from: eliesteinbock@gmail.com\n`,
    `subject: ${body.subject}\n`,
    `In-Reply-To: <${body.threadId}@gmail.com>\n`,
    `References: <${body.threadId}@gmail.com>\n\n`,
    `${body.body}`,
  ].join("");

  const draft = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw: Buffer.from(message)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_"),
        threadId: body.threadId,
      },
    },
  });

  return { draft };
}

export const POST = withError(async (request: Request) => {
  const json = await request.json();
  const body = draftEmailBody.parse(json);

  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);
  const draft = await draftEmail(body, gmail);

  return NextResponse.json(draft);
});
