import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getICloudConnection } from "@/utils/icloud/connection";
import { withICloudClient } from "@/utils/icloud/client";

export type GetICloudFoldersResponse = Awaited<ReturnType<typeof getData>>;
export const GET = withEmailAccount("icloud/folders", async (request) =>
  NextResponse.json(await getData(request.auth.emailAccountId)),
);
async function getData(emailAccountId: string) {
  const connection = await getICloudConnection(emailAccountId);
  const folders = await withICloudClient(connection, async (client) =>
    (await client.list())
      .filter((folder) => !folder.flags.has("\\Noselect"))
      .map((folder) => ({ path: folder.path, specialUse: folder.specialUse })),
  );
  return { folders, mapping: connection.folders };
}
