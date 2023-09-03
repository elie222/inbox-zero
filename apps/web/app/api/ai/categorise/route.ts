import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { categorise } from "@/app/api/ai/categorise/controller";
import { getAuthSession } from "@/utils/auth";
import { categoriseBodyWithHtml } from "@/app/api/ai/categorise/validation";
import { parseEmail } from "@/utils/mail";

export const POST = withError(async (request: Request) => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = categoriseBodyWithHtml.parse(json);

  const content =
    parseEmail(body.textHtml || "") || body.textPlain || body.snippet || "";

  const res = await categorise(
    { ...body, content },
    { email: session.user.email }
  );

  return NextResponse.json(res);
});
