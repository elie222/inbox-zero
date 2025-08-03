import pRetry, { AbortError } from "p-retry";

const TINYBIRD_BASE_URL = process.env.TINYBIRD_BASE_URL;
const TINYBIRD_TOKEN = process.env.TINYBIRD_TOKEN;

async function deleteFromDatasource(
  datasource: string,
  deleteCondition: string, // e.g. "email='abc@example.com'"
): Promise<unknown> {
  const url = new URL(
    `/v0/datasources/${datasource}/delete`,
    TINYBIRD_BASE_URL,
  );
  const res = await fetch(url, {
    method: "POST",
    body: `delete_condition=(${deleteCondition})`,
    headers: {
      Authorization: `Bearer ${TINYBIRD_TOKEN}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!res.ok) {
    throw new Error(
      `Unable to delete for datasource ${datasource}: [${
        res.status
      }] ${await res.text()}`,
    );
  }

  return await res.json();
}

// Tinybird only allows 1 delete at a time
async function _deleteFromDatasourceWithRetry(
  datasource: string,
  deleteCondition: string,
): Promise<unknown> {
  return pRetry(
    async () => {
      try {
        return await deleteFromDatasource(datasource, deleteCondition);
      } catch (error) {
        // Only retry on rate limit errors
        if (error instanceof Error && error.message.includes("429")) {
          throw error; // pRetry will handle this
        }
        throw new AbortError(error as Error); // Don't retry other errors
      }
    },
    {
      retries: 5,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 30_000,
      randomize: true,
      onFailedAttempt: (error) => {
        console.log(
          `Rate limited when deleting from ${datasource}. Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`,
        );
      },
    },
  );
}
