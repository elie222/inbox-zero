import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import {
  archiveBody,
  archiveEmail,
} from "@/app/api/google/threads/archive/controller";

export const POST = withError(async (request: Request) => {
  const json = await request.json();
  const body = archiveBody.parse(json);

  try {
    const thread = await archiveEmail(body);
    return NextResponse.json(thread);
  } catch (error) {
    return NextResponse.json({ error });
  }
});
