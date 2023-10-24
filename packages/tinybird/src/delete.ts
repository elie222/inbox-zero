async function deleteFromDatasource(
  datasource: string,
  deleteCondition: string // eg. "email='abc@example.com'"
): Promise<unknown> {
  const url = new URL(
    `/v0/datasources/${datasource}/delete`,
    process.env.TINYBIRD_BASE_URL
  );
  let res = await fetch(url, {
    method: "POST",
    body: `delete_condition=(${deleteCondition})`,
    headers: { Authorization: `Bearer ${process.env.TINYBIRD_TOKEN}` },
  });

  if (!res.ok) {
    throw new Error(
      `Unable to delete for datasource ${datasource}: [${
        res.status
      }] ${await res.text()}`
    );
  }

  return await res.json();
}

export async function deleteTinybirdEmails(options: {
  email: string;
}): Promise<unknown> {
  return await deleteFromDatasource("email", `email='${options.email}'`);
}
