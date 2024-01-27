// this router will be used to load latest data into the indexeddb
// Or can they be loaded on the runtime unlike loading it into tb ?

// how to query data from indexeddb ?

import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { loadIndexedDBMails } from "./getAll";
// import { loadTinybirdEmails } from "@/app/api/user/stats/tinybird/load/load-emails";
// import { loadTinybirdEmailsBody } from "@/app/api/user/stats/tinybird/load/validation";

export const maxDuration = 90;

/* TODO: Make the Reponse Return Type */
export type ResponseGmail = any;

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  //no error handling for this line ??

  // TODO: Make a validation logic for
  const body = json;
  // const body = loadTinybirdEmailsBody.parse(json);

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);

  if (!token.token) return NextResponse.json({ error: "Missing access token" });

  const result = await loadIndexedDBMails(
    {
      ownerEmail: session.user.email,
      gmail,
      accessToken: token.token,
    },
    body,
  );

  return NextResponse.json(result);
});
// export const GET = POST;
