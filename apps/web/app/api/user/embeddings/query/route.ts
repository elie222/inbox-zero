import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { PINECONE_INDEX_NAME, queryIndex } from "@inboxzero/pinecone";
import { createEmbedding } from "@inboxzero/embedding";
import { getMessagesBatch } from "@/utils/gmail/message";
import { getGmailAccessToken } from "@/utils/gmail/client";
import { getOpenAI } from "@/utils/llms/openai";
import prisma from "@/utils/prisma";

export type queryEmbeddingsResponse = Awaited<
  ReturnType<typeof queryEmbeddings>
>;

async function queryEmbeddings(query: string) {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const token = await getGmailAccessToken(session);
  const accessToken = token.token;

  if (!accessToken)
    return NextResponse.json({ error: "Missing Gmail access token" });

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { openAIApiKey: true },
  });
  const openai = getOpenAI(user?.openAIApiKey || null);

  const embedding = await createEmbedding(openai, {
    input: query,
    userId: session.user.id,
  });

  const res = await queryIndex(
    PINECONE_INDEX_NAME,
    session.user.email,
    embedding.data[0].embedding,
    10,
  );

  const messages = await getMessagesBatch(
    res.map((m) => m.id),
    accessToken,
  );

  const orderedMessages = res.map((result) => {
    const m = messages.find((m) => m.id === result.id);
    return {
      ...result,
      subject: m?.headers.subject,
      body: m?.headers.from,
      threadId: m?.threadId,
      messageId: m?.id,
    };
  });

  return { orderedMessages };
}

export const GET = withError(async (request: Request) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("query");
  if (!query) return NextResponse.json({ error: "Missing query" });
  const result = await queryEmbeddings(query);

  return NextResponse.json(result);
});
