const TINYBIRD_BASE_URL = process.env.TINYBIRD_BASE_URL;
const TINYBIRD_TOKEN = process.env.TINYBIRD_TOKEN;

async function deleteFromDatasource(
  datasource: string,
  deleteCondition: string, // eg. "userId='abc@example.com'"
): Promise<unknown> {
  if (!TINYBIRD_BASE_URL || !TINYBIRD_TOKEN) {
    console.warn("TINYBIRD_BASE_URL or TINYBIRD_TOKEN missing");
    return;
  }

  const url = new URL(
    `/v0/datasources/${datasource}/delete`,
    TINYBIRD_BASE_URL,
  );
  let res = await fetch(url, {
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

export async function deleteTinybirdAiCalls(options: {
  userId: string;
}): Promise<unknown> {
  return await deleteFromDatasource("aiCall", `userId='${options.userId}'`);
}
