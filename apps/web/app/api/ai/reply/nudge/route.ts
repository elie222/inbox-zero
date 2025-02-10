import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { aiGenerateNudge } from "@/utils/ai/reply/generate-nudge";
import { getAiUserByEmail } from "@/utils/user/get";
import { emailToContent } from "@/utils/mail";

const messageSchema = z
  .object({
    id: z.string(),
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

export type GenerateReplyBody = z.infer<typeof generateReplyBody>;

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const user = await getAiUserByEmail({ email: session.user.email });

  if (!user) return NextResponse.json({ error: "User not found" });

  const json = await request.json();
  const body = generateReplyBody.parse(json);

  const lastMessage = body.messages.at(-1);

  if (!lastMessage) return NextResponse.json({ error: "No message provided" });

  const messages = body.messages.map((msg) => ({
    ...msg,
    date: new Date(msg.date),
    content: emailToContent({
      textPlain: msg.textPlain,
      textHtml: msg.textHtml,
      snippet: "",
    }),
  }));

  const text = await aiGenerateNudge({ messages, user });

  return NextResponse.json({ text });
});
