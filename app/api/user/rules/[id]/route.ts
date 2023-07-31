import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import {
  getRule,
  updateRule,
  deleteRule,
} from "@/app/api/user/rules/[id]/controller";
import { updateRuleBody } from "@/app/api/user/rules/[id]/validation";
import { withError } from "@/utils/middleware";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const result = await getRule({ id: params.id, userId: session.user.id });

  return NextResponse.json(result);
}

export const POST = withError(
  async (request: Request, params: { id: string }) => {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Not authenticated" });

    const json = await request.json();
    const body = updateRuleBody.parse(json);

    const result = await updateRule({
      id: params.id,
      userId: session.user.id,
      body,
    });

    return NextResponse.json(result);
  }
);

export async function DELETE(_request: Request, params: { id: string }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const result = await deleteRule({ id: params.id, userId: session.user.id });

  return NextResponse.json(result);
}
