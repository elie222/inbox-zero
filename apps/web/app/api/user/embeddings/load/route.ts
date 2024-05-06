import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { batchUpsertIndexes, PINECONE_INDEX_NAME } from "@inboxzero/pinecone";
import { createEmbedding } from "@inboxzero/embedding";
import { queryBatchMessages } from "@/utils/gmail/message";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { getOpenAI } from "@/utils/llms/openai";
import prisma from "@/utils/prisma";

export type loadEmbeddingsResponse = Awaited<ReturnType<typeof loadEmbeddings>>;

async function loadEmbeddings() {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);
  const accessToken = token.token;

  if (!accessToken)
    return NextResponse.json({ error: "Missing Gmail access token" });

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { openAIApiKey: true },
  });
  const openai = getOpenAI(user?.openAIApiKey || null);

  // await createIndex(PINECONE_INDEX_NAME);

  let nextPageToken: string | null | undefined = undefined;

  do {
    const { messages: pageMessages, nextPageToken: pageToken } =
      await queryBatchMessages(gmail, accessToken, {
        pageToken: nextPageToken,
      });

    const embeddings = [];

    for (const message of pageMessages) {
      if (!message.id) continue;
      console.log("Loading embedding for message", message.id);
      const embedding = await createEmbedding(openai, {
        input: message.headers.subject,
        userId: session.user.id,
      });
      embeddings.push({
        id: message.id,
        threadId: message.threadId,
        values: embedding.data[0].embedding,
      });
    }

    await batchUpsertIndexes(
      PINECONE_INDEX_NAME,
      session.user.email,
      embeddings.map((embedding) => ({
        id: embedding.id,
        values: embedding.values,
        metadata: { threadId: embedding.threadId },
      })),
    );

    nextPageToken = pageToken;
  } while (nextPageToken);

  return { success: true };
}

export const GET = withError(async (_request: Request) => {
  const result = await loadEmbeddings();
  return NextResponse.json(result);
});
