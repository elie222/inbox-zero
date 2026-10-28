import { NextResponse } from "next/server";
import { getUserErrorMessages } from "@/utils/error-messages";
import { withAuth } from "@/utils/middleware";

export type GetErrorMessagesResponse = Awaited<
  ReturnType<typeof getUserErrorMessages>
>;

export const GET = withAuth("user/error-messages", async (request) =>
  NextResponse.json(await getUserErrorMessages(request.auth.userId)),
);
