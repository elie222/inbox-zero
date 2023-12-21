import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import {
  deleteRule,
  getRules,
  updateRules,
} from "@/app/api/user/rules/controller";
import {
  deleteRulesBody,
  updateRulesBody,
} from "@/app/api/user/rules/validation";
import { withError } from "@/utils/middleware";

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const result = await getRules({ userId: session.user.id });

  return NextResponse.json(result);
});

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = updateRulesBody.parse(json);

  const result = await updateRules({ userId: session.user.id, body });

  return NextResponse.json(result);
});

export const DELETE = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = deleteRulesBody.parse(json);

  await deleteRule(body, session.user.id);

  return NextResponse.json({ success: true });
});
