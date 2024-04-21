import { Pinecone } from "@pinecone-database/pinecone";

export const PINECONE_INDEX_NAME = "email-embeddings";

let pinecone: Pinecone;

function getPinecone() {
  if (pinecone) return pinecone;

  if (!process.env.PINECONE_API_KEY)
    throw new Error("PINECONE_API_KEY is not set");

  pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  return pinecone;
}

export async function createIndex(name: string) {
  return await getPinecone().createIndex({
    name,
    dimension: 256,
    metric: "cosine",
    spec: {
      serverless: {
        cloud: "aws",
        region: "us-east-1",
      },
    },
  });
}

export async function batchUpsertIndexes(
  name: string,
  namespace: string,
  vectors: { id: string; values: number[]; metadata?: Record<string, any> }[],
) {
  return await getPinecone().index(name).namespace(namespace).upsert(vectors);
}

export async function queryIndex(
  name: string,
  namespace: string,
  vector: number[],
  topK: number,
  filter?: Record<string, any>,
) {
  const queryResponse = await getPinecone()
    .index(name)
    .namespace(namespace)
    .query({
      vector,
      filter,
      topK,
      includeMetadata: true,
    });
  return queryResponse.matches;
}
