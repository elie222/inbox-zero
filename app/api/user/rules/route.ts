import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import {
  deleteRule,
  getRules,
  updateRules,
} from "@/app/api/user/rules/controller";
import {
  deleteRulesBody,
  updateRulesBody,
} from "@/app/api/user/rules/validation";

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const result = await getRules({ userId: session.user.id });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = updateRulesBody.parse(json);

  const result = await updateRules({ userId: session.user.id, body });

  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = deleteRulesBody.parse(json);

  await deleteRule(body, session.user.id);

  return NextResponse.json({ success: true });
}
