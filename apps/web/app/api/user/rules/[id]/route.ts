import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import {
  getRule,
  updateRule,
  deleteRule,
} from "@/app/api/user/rules/[id]/controller";
import { updateRuleBody } from "@/app/api/user/rules/[id]/validation";
import { withError } from "@/utils/middleware";

export const GET = withError(async (request, { params }) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  if (!params.id) return NextResponse.json({ error: "Missing id" });

  const result = await getRule({ id: params.id, userId: session.user.id });

  return NextResponse.json(result);
});

export const POST = withError(
  async (request, { params }: { params: { id?: string } }) => {
    const session = await auth();
    if (!session?.user.email)
      return NextResponse.json({ error: "Not authenticated" });
    if (!params.id) return NextResponse.json({ error: "Missing id" });

    const json = await request.json();
    const body = updateRuleBody.parse(json);

    const result = await updateRule({
      id: params.id,
      userId: session.user.id,
      body,
    });

    return NextResponse.json(result);
  },
);

export const DELETE = withError(async (_request, { params }) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  if (!params.id) return NextResponse.json({ error: "Missing id" });

  const result = await deleteRule({ id: params.id, userId: session.user.id });

  return NextResponse.json(result);
});
