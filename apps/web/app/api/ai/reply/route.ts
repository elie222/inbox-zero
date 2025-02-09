import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { aiGenerateReply } from "@/utils/ai/reply/generate-reply";
import { getAiUserByEmail } from "@/utils/user/get";

const messageSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    subject: z.string(),
    textPlain: z.string().optional(),
    textHtml: z.string().optional(),
    date: z.string(),
  })
  .refine((data) => data.textPlain || data.textHtml, {
    message: "At least one of textPlain or textHtml is required",
  });

const generateReplyBody = z.object({
  messages: z.array(messageSchema),
});

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const user = await getAiUserByEmail({ email: session.user.email });

  if (!user) return NextResponse.json({ error: "User not found" });

  const json = await request.json();
  const body = generateReplyBody.parse(json);

  const stream = await aiGenerateReply({
    messages: body.messages.map((msg) => ({
      ...msg,
      date: new Date(msg.date),
      // TODO: parse content from html
      content: msg.textPlain || msg.textHtml || "",
    })),
    user,
  });

  return stream;
});
