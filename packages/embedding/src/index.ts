import type OpenAI from "openai";

export async function createEmbedding(
  openai: OpenAI,
  body: {
    input: OpenAI.Embeddings.EmbeddingCreateParams["input"];
    userId: string;
    model?: OpenAI.Embeddings.EmbeddingCreateParams["model"];
    dimensions?: OpenAI.Embeddings.EmbeddingCreateParams["dimensions"];
  },
) {
  const embedding = await openai.embeddings.create({
    ...body,
    model: body.model || "text-embedding-3-small",
    dimensions: body.dimensions || 256,
    user: body.userId,
  });
  return embedding;
}
